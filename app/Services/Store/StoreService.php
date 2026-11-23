<?php

namespace Pterodactyl\Services\Store;

use Pterodactyl\Models\Box;
use Pterodactyl\Models\User;
use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\StoreOrder;
use Pterodactyl\Models\StoreOrderItem;
use Pterodactyl\Models\StorePackage;
use Pterodactyl\Services\Boxes\BoxService;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\Objects\DeploymentObject;
use Pterodactyl\Services\Servers\SelfServiceEgg;
use Pterodactyl\Services\Servers\SuspensionService;
use Pterodactyl\Services\Store\Payments\StripeProvider;
use Pterodactyl\Services\Store\Payments\PayPalProvider;
use Pterodactyl\Services\Servers\ServerCreationService;
use Pterodactyl\Services\Store\Payments\PaymentProvider;
use Pterodactyl\Services\Store\Payments\PaymentException;
use Pterodactyl\Services\Deployment\AllocationSelectionService;
use Pterodactyl\Services\Allocations\FindAssignableAllocationService;
use Pterodactyl\Exceptions\Service\Allocation\NoAutoAllocationSpaceAvailableException;

/**
 * The store: packages that are bought with a payment service, and what a payment does. A paid order makes a server, or a box, for the
 * buyer, or lengthens what they already have. Boxes work without any of this, see {@see BoxService}.
 *
 * An order is only believed because the payment service said so (asked again by the panel, or by a webhook that was checked), never because
 * of what the browser says.
 */
class StoreService
{
    public function __construct(
        private StoreSettings $settings,
        private StripeProvider $stripe,
        private PayPalProvider $paypal,
        private BoxService $boxes,
        private SuspensionService $suspension,
        private ServerCreationService $creation,
        private AllocationSelectionService $allocationSelection,
        private FindAssignableAllocationService $findAllocation,
        private SelfServiceEgg $eggs,
    ) {
    }

    // ---- what can be paid with --------------------------------------------------------------------------------------------------

    /** @return array<string, PaymentProvider> the services that have their keys, by id */
    public function providers(): array
    {
        return collect([$this->stripe, $this->paypal])->filter(fn (PaymentProvider $p) => $p->configured())->keyBy(fn (PaymentProvider $p) => $p->id())->all();
    }

    public function provider(string $id): PaymentProvider
    {
        $all = $this->providers();
        if (!isset($all[$id])) {
            throw new DisplayException('That way of paying is not available.');
        }

        return $all[$id];
    }

    /** Whether people can buy: the store is on and there is something to pay with. */
    public function open(): bool
    {
        return $this->settings->enabled() && $this->providers() !== [];
    }

    /** @return Collection<int, StorePackage> */
    public function packages(): Collection
    {
        return StorePackage::query()->where('active', true)->orderBy('sort')->orderBy('id')->get();
    }

    // ---- buying ------------------------------------------------------------------------------------------------------------------

    /** The most things one payment can be for. */
    public const MAX_ITEMS = 20;

    /**
     * Starts a payment for what is in the cart. Returns the address of the page of the payment service where the person pays.
     *
     * @param  list<array{package: StorePackage, renew?: Box|Server|null}>  $lines  one for every box or server, a renewal names what it renews
     *
     * @throws DisplayException
     */
    public function checkout(User $user, array $lines, string $providerId): string
    {
        if (!$this->settings->enabled()) {
            throw new DisplayException('The store is closed.');
        }
        $provider = $this->provider($providerId);
        if ($lines === []) {
            throw new DisplayException('The cart is empty.');
        }
        if (count($lines) > self::MAX_ITEMS) {
            throw new DisplayException('At most ' . self::MAX_ITEMS . ' things can be paid for at once.');
        }

        $renewing = [];
        foreach ($lines as $line) {
            /** @var StorePackage $package */
            $package = $line['package'];
            $renew = $line['renew'] ?? null;
            if (!$package->active && !$renew) {
                throw new DisplayException($package->name . ' is not for sale any more.');
            }
            if ($package->price < 1) {
                throw new DisplayException($package->name . ' has no price.');
            }
            if ($renew) {
                if (!$package->period_days) {
                    throw new DisplayException($package->name . ' is paid once, there is nothing to renew.');
                }
                if ((int) ($renew instanceof Box ? $renew->user_id : $renew->owner_id) !== $user->id) {
                    throw new DisplayException('That is not yours to renew.');
                }
                $key = ($renew instanceof Box ? 'b' : 's') . $renew->id;
                if (isset($renewing[$key])) {
                    throw new DisplayException('Renew ' . ($renew->name ?? 'it') . ' once per payment, pay for more time after this one.');
                }
                $renewing[$key] = true;
            }
        }

        $order = DB::transaction(function () use ($user, $lines, $provider) {
            $order = StoreOrder::query()->create([
                'user_id' => $user->id,
                'package_name' => count($lines) === 1 ? $lines[0]['package']->name : count($lines) . ' items',
                'kind' => 'cart',
                'specs' => [],
                'amount' => array_sum(array_map(fn ($l) => $l['package']->price, $lines)),
                'currency' => $this->settings->currency(),
                'provider' => $provider->id(),
                'status' => StoreOrder::PENDING,
            ]);
            foreach ($lines as $line) {
                $package = $line['package'];
                $renew = $line['renew'] ?? null;
                $order->items()->create([
                    'package_id' => $package->id,
                    'package_name' => $package->name,
                    'kind' => $package->kind,
                    'specs' => $package->specs() + ['node_id' => $package->node_id, 'egg_id' => $package->egg_id],
                    'amount' => $package->price,
                    'period_days' => $package->period_days,
                    'renewal' => $renew !== null,
                    'box_id' => $renew instanceof Box ? $renew->id : null,
                    'server_id' => $renew instanceof Server ? $renew->id : null,
                ]);
            }

            return $order;
        });

        try {
            return $provider->checkout($order->setRelation('user', $user)->load('items'), $this->settings->appUrl() . '/store/return?order=' . $order->uuid, $this->settings->appUrl() . '/store?canceled=1');
        } catch (PaymentException $e) {
            $order->forceFill(['status' => StoreOrder::FAILED, 'error' => $e->getMessage()])->save();

            throw $e;
        }
    }

    /**
     * What a person coming back from the payment page (or a webhook) means for an order: asks the payment service and settles it.
     *
     * @throws PaymentException
     */
    public function confirm(StoreOrder $order, Request $returned): StoreOrder
    {
        if ($order->status === StoreOrder::PENDING) {
            $this->settle($order, $this->provider($order->provider)->status($order, $returned));
        }

        return $order->refresh();
    }

    /** Applies what the payment service said about an order. Safe to call again with the same news. */
    public function settle(StoreOrder $order, string $status): void
    {
        DB::transaction(function () use ($order, $status) {
            /** @var StoreOrder $locked */
            $locked = StoreOrder::query()->lockForUpdate()->findOrFail($order->id);

            if ($status === StoreOrder::PAID && in_array($locked->status, [StoreOrder::PENDING, StoreOrder::FAILED], true)) {
                $locked->forceFill(['status' => StoreOrder::PAID, 'paid_at' => now(), 'error' => null])->save();
            } elseif ($status === StoreOrder::REFUNDED && $locked->status === StoreOrder::PAID) {
                $locked->forceFill(['status' => StoreOrder::REFUNDED])->save();
            } elseif (in_array($status, [StoreOrder::CANCELED, StoreOrder::FAILED], true) && $locked->status === StoreOrder::PENDING) {
                $locked->forceFill(['status' => $status])->save();
            }
        });

        $order->refresh();
        if ($order->status === StoreOrder::PAID && $order->fulfilled_at === null) {
            $this->fulfill($order);
        }
    }

    /**
     * Makes what was bought, line by line. A paid order is never lost: what can not be made (no room on any node, for one) keeps its reason
     * on the line and an admin can try again, the lines that were made stay made.
     */
    public function fulfill(StoreOrder $order): StoreOrder
    {
        $order->load(['items', 'user']);
        foreach ($order->items as $item) {
            if ($item->fulfilled_at !== null) {
                continue;
            }
            try {
                DB::transaction(function () use ($item, $order) {
                    /** @var StoreOrderItem $locked */
                    $locked = StoreOrderItem::query()->lockForUpdate()->findOrFail($item->id);
                    if ($locked->fulfilled_at !== null || $order->fresh()->status !== StoreOrder::PAID) {
                        return;
                    }

                    $locked->renewal ? $this->renew($locked) : $this->make($locked, $order->user);
                    $locked->forceFill(['fulfilled_at' => now(), 'error' => null])->save();
                });
            } catch (\Throwable $e) {
                report($e);
                $item->forceFill(['error' => $e instanceof DisplayException ? $e->getMessage() : 'It could not be set up: ' . $e->getMessage()])->save();
            }
        }

        $order->load('items');
        $open = $order->items->first(fn (StoreOrderItem $i) => $i->fulfilled_at === null);
        $order->forceFill($open === null ? ['fulfilled_at' => now(), 'error' => null] : ['error' => $open->package_name . ': ' . ($open->error ?? 'it is waiting to be set up')])->save();

        return $order->refresh();
    }

    private function make(StoreOrderItem $item, User $user): void
    {
        $specs = $item->specs;
        $expires = $item->period_days ? now()->addDays($item->period_days) : null;

        if ($item->kind === StorePackage::BOX) {
            $box = $this->boxes->create($user, $specs + [
                'name' => $item->package_name,
                'node_id' => $specs['node_id'] ?? null,
                'source' => 'order',
                'expires_at' => $expires,
            ]);
            $item->forceFill(['box_id' => $box->id]);

            return;
        }

        $server = $this->makeServer($user, $item->package_name, $specs);
        $server->forceFill(['expires_at' => $expires])->save();
        $item->forceFill(['server_id' => $server->id]);
    }

    /** Lengthens a box or a server by what the line paid for, and lets it run again if it had run out. */
    private function renew(StoreOrderItem $item): void
    {
        $target = $item->box_id ? Box::query()->find($item->box_id) : Server::query()->find($item->server_id);
        if (!$target) {
            throw new DisplayException('What was renewed does not exist any more.');
        }
        $from = $target->expires_at && $target->expires_at->isFuture() ? $target->expires_at : now();
        $wasOut = $target->expires_at !== null && $target->expires_at->isPast();
        $target->forceFill(['expires_at' => $from->copy()->addDays((int) $item->period_days)])->save();

        if ($wasOut) {
            $target instanceof Box ? $this->boxes->unsuspend($target) : $this->suspension->toggle($target, SuspensionService::ACTION_UNSUSPEND);
        }
    }

    /**
     * A server of its own for somebody who bought one: the egg new servers start from, the node of the package or any node with room.
     *
     * @param  array<string, mixed>  $specs
     */
    public function makeServer(User $user, string $name, array $specs): Server
    {
        $placement = [];
        $deployment = null;
        if (!empty($specs['node_id'])) {
            $allocation = $this->allocationSelection->setDedicated(false)->setNodes([(int) $specs['node_id']])->setPorts([])->handle();
            $placement = ['node_id' => $allocation->node_id, 'allocation_id' => $allocation->id];
        } else {
            $deployment = (new DeploymentObject())->setDedicated(false)->setLocations(config('pterodactyl.self_service.locations') ?? [])->setPorts([]);
        }

        $egg = $this->eggs->resolve(!empty($specs['egg_id']) ? $specs['egg_id'] : config('pterodactyl.self_service.egg'));
        $environment = [];
        foreach ($egg->variables as $variable) {
            $environment[$variable->env_variable] = $variable->default_value;
        }
        $ports = max(1, (int) ($specs['allocations'] ?? 1));

        $server = $this->creation->handle(array_merge([
            'external_id' => null,
            'name' => $name,
            'description' => '',
            'owner_id' => $user->id,
            'egg_id' => $egg->id,
            'nest_id' => $egg->nest_id,
            'image' => $this->eggs->newestJavaImage($egg->docker_images ?? []),
            'startup' => $egg->startup,
            'environment' => $environment,
            'memory' => (int) $specs['memory'],
            'swap' => 0,
            'disk' => (int) $specs['disk'],
            'io' => 500,
            'cpu' => (int) $specs['cpu'],
            'threads' => null,
            'skip_scripts' => (bool) (config('pterodactyl.self_service.skip_scripts') ?? preg_match('/^java/i', $egg->name)),
            'oom_disabled' => true,
            'database_limit' => (int) ($specs['databases'] ?? 0),
            'allocation_limit' => $ports,
            'backup_limit' => (int) ($specs['backups'] ?? 0),
            'start_on_completion' => false,
        ], $placement), $deployment);

        for ($i = 1; $i < $ports; ++$i) {
            try {
                DB::transaction(fn () => $this->findAllocation->handle($server->loadMissing(['node', 'allocation'])));
                $server->unsetRelation('allocations');
            } catch (NoAutoAllocationSpaceAvailableException) {
                break;
            }
        }

        return $server;
    }

    /**
     * Gives the money back through the payment service. With `$revoke` what was bought stops working (a box or server is suspended).
     *
     * @throws PaymentException
     */
    public function refund(StoreOrder $order, bool $revoke): StoreOrder
    {
        if ($order->status !== StoreOrder::PAID) {
            throw new DisplayException('Only a payment that went through can be refunded.');
        }
        $this->provider($order->provider)->refund($order);
        $order->forceFill(['status' => StoreOrder::REFUNDED])->save();

        if ($revoke) {
            foreach ($order->items()->get() as $item) {
                if ($item->box_id && ($box = Box::query()->find($item->box_id))) {
                    $this->boxes->suspend($box, Box::EXPIRED);
                } elseif ($item->server_id && ($server = Server::query()->find($item->server_id))) {
                    $this->suspension->toggle($server, SuspensionService::ACTION_SUSPEND);
                }
            }
        }

        return $order;
    }

    // ---- running out -----------------------------------------------------------------------------------------------------------

    /**
     * Stops what was not paid for again: boxes and servers whose time ran out are suspended. Nothing is deleted, paying (or an admin)
     * brings it back. Returns how many were stopped.
     */
    public function expireDue(): int
    {
        $count = 0;
        foreach (Box::query()->where('status', Box::ACTIVE)->whereNotNull('expires_at')->where('expires_at', '<', now())->get() as $box) {
            $this->boxes->suspend($box, Box::EXPIRED);
            ++$count;
        }
        foreach (Server::query()->whereNull('box_id')->whereNotNull('expires_at')->where('expires_at', '<', now())->whereNull('status')->get() as $server) {
            try {
                $this->suspension->toggle($server, SuspensionService::ACTION_SUSPEND);
                ++$count;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $count;
    }
}

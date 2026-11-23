<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Pterodactyl\Models\Box;
use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\StoreOrder;
use Pterodactyl\Models\StorePackage;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Store\StoreService;
use Pterodactyl\Services\Store\StoreSettings;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** The store as a person sees it: what is for sale, paying, coming back from paying, and what they bought. */
class StoreController extends ClientApiController
{
    public function __construct(private StoreService $store, private StoreSettings $settings)
    {
        parent::__construct();
    }

    public function index(ClientApiRequest $request): JsonResponse
    {
        $open = $this->store->open();

        return new JsonResponse([
            'open' => $open,
            // Whether there is anything to look at: the store is on, or the person has something that came from it.
            'currency' => $this->settings->currency(),
            'providers' => collect($this->store->providers())->map(fn ($p) => ['id' => $p->id(), 'name' => $p->name()])->values()->all(),
            'packages' => $open ? $this->store->packages()->map(fn (StorePackage $p) => self::package($p))->values()->all() : [],
        ]);
    }

    /**
     * Starts a payment for what is in the cart: boxes and servers, and renewals of a box or server the person has. Answers with the page to
     * pay on. The prices are the ones of the store now, whatever the cart showed.
     *
     * @throws DisplayException
     */
    public function checkout(ClientApiRequest $request): JsonResponse
    {
        $data = $request->validate([
            'provider' => 'required|string|in:stripe,paypal',
            'items' => 'required|array|min:1|max:' . StoreService::MAX_ITEMS,
            'items.*.package' => 'required|string|exists:store_packages,uuid',
            'items.*.quantity' => 'sometimes|integer|min:1|max:' . StoreService::MAX_ITEMS,
            'items.*.box' => 'sometimes|nullable|string|exists:boxes,uuid',
            'items.*.server' => 'sometimes|nullable|string|exists:servers,uuid',
        ]);
        $user = $request->user();

        $lines = [];
        foreach ($data['items'] as $row) {
            $package = StorePackage::query()->where('uuid', $row['package'])->firstOrFail();
            $renew = null;
            if (!empty($row['box'])) {
                $renew = Box::query()->where('uuid', $row['box'])->where('user_id', $user->id)->first() ?? throw new DisplayException('That box is not yours.');
                if ($package->kind !== StorePackage::BOX) {
                    throw new DisplayException($package->name . ' does not renew a box.');
                }
            } elseif (!empty($row['server'])) {
                $renew = Server::query()->where('uuid', $row['server'])->where('owner_id', $user->id)->first() ?? throw new DisplayException('That server is not yours.');
                if ($package->kind !== StorePackage::SERVER) {
                    throw new DisplayException($package->name . ' does not renew a server.');
                }
            }
            // A renewal is one line, a purchase is as many as were put in the cart.
            for ($n = 0; $n < ($renew ? 1 : (int) ($row['quantity'] ?? 1)); ++$n) {
                $lines[] = ['package' => $package, 'renew' => $renew];
            }
        }

        $url = $this->store->checkout($user, $lines, $data['provider']);
        Activity::event('user:store.checkout')->property(['package' => count($lines) === 1 ? $lines[0]['package']->name : count($lines) . ' items', 'provider' => $data['provider']])->log();

        return new JsonResponse(['url' => $url]);
    }

    /** The person came back from paying: ask the payment service what happened (it is never taken from the address), and make what was bought. */
    public function confirm(ClientApiRequest $request, string $order): JsonResponse
    {
        $found = StoreOrder::query()->where('uuid', $order)->where('user_id', $request->user()->id)->firstOrFail();
        $found = $this->store->confirm($found, $request)->load('items');

        return new JsonResponse(self::order($found));
    }

    public function orders(ClientApiRequest $request): JsonResponse
    {
        $orders = StoreOrder::query()->with('items')->where('user_id', $request->user()->id)->where('status', '!=', StoreOrder::PENDING)->orderByDesc('id')->limit(100)->get();

        return new JsonResponse(['data' => $orders->map(fn (StoreOrder $o) => self::order($o))->values()->all()]);
    }

    /** @return array<string, mixed> */
    public static function package(StorePackage $p): array
    {
        return [
            'id' => $p->uuid,
            'name' => $p->name,
            'description' => $p->description,
            'kind' => $p->kind,
            'price' => $p->price,
            'period_days' => $p->period_days,
            'memory' => $p->memory,
            'disk' => $p->disk,
            'cpu' => $p->cpu,
            'allocations' => $p->allocations,
            'backups' => $p->backups,
            'databases' => $p->databases,
        ];
    }

    /** @return array<string, mixed> */
    public static function order(StoreOrder $o): array
    {
        $o->loadMissing('items');

        return [
            'id' => $o->uuid,
            'package' => $o->package_name,
            'amount' => $o->amount,
            'currency' => $o->currency,
            'provider' => $o->provider,
            'status' => $o->status,
            // Paid, and waiting for something to be made (or it could not be: the admin has to look).
            'setting_up' => $o->isSettingUp(),
            'problem' => $o->isSettingUp() ? $o->error : null,
            'items' => $o->items->map(fn ($i) => [
                'name' => $i->package_name,
                'kind' => $i->kind,
                'amount' => $i->amount,
                'renewal' => $i->renewal,
                'done' => $i->fulfilled_at !== null,
                'box' => $i->box_id ? Box::query()->whereKey($i->box_id)->value('uuid') : null,
                'server' => $i->server_id ? Server::query()->whereKey($i->server_id)->value('uuidShort') : null,
            ])->values()->all(),
            'paid_at' => $o->paid_at?->toIso8601String(),
            'created_at' => $o->created_at?->toIso8601String(),
        ];
    }
}

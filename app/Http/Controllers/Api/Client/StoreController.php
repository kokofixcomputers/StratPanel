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
     * Starts a payment for a package, or for renewing a box or server the person has. Answers with the page to pay on.
     *
     * @throws DisplayException
     */
    public function checkout(ClientApiRequest $request): JsonResponse
    {
        $data = $request->validate([
            'package' => 'required|string|exists:store_packages,uuid',
            'provider' => 'required|string|in:stripe,paypal',
            'box' => 'sometimes|nullable|string|exists:boxes,uuid',
            'server' => 'sometimes|nullable|string|exists:servers,uuid',
        ]);
        $user = $request->user();
        $package = StorePackage::query()->where('uuid', $data['package'])->firstOrFail();

        $renew = null;
        if (!empty($data['box'])) {
            $renew = Box::query()->where('uuid', $data['box'])->where('user_id', $user->id)->first() ?? throw new DisplayException('That box is not yours.');
        } elseif (!empty($data['server'])) {
            $renew = Server::query()->where('uuid', $data['server'])->where('owner_id', $user->id)->first() ?? throw new DisplayException('That server is not yours.');
        }
        if ($renew && $renew instanceof Box && $package->kind !== StorePackage::BOX) {
            throw new DisplayException('That package does not renew a box.');
        }
        if ($renew && $renew instanceof Server && $package->kind !== StorePackage::SERVER) {
            throw new DisplayException('That package does not renew a server.');
        }

        $url = $this->store->checkout($user, $package, $data['provider'], $renew);
        Activity::event('user:store.checkout')->property(['package' => $package->name, 'provider' => $data['provider']])->log();

        return new JsonResponse(['url' => $url]);
    }

    /** The person came back from paying: ask the payment service what happened (it is never taken from the address), and make what was bought. */
    public function confirm(ClientApiRequest $request, string $order): JsonResponse
    {
        $found = StoreOrder::query()->where('uuid', $order)->where('user_id', $request->user()->id)->firstOrFail();
        $found = $this->store->confirm($found, $request);

        return new JsonResponse(self::order($found));
    }

    public function orders(ClientApiRequest $request): JsonResponse
    {
        $orders = StoreOrder::query()->where('user_id', $request->user()->id)->where('status', '!=', StoreOrder::PENDING)->orderByDesc('id')->limit(100)->get();

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
        return [
            'id' => $o->uuid,
            'package' => $o->package_name,
            'kind' => $o->kind,
            'amount' => $o->amount,
            'currency' => $o->currency,
            'provider' => $o->provider,
            'status' => $o->status,
            'renewal' => $o->renewal,
            // Paid and waiting for the box or server to be made (or it could not be: the admin has to look).
            'setting_up' => $o->status === StoreOrder::PAID && $o->fulfilled_at === null,
            'problem' => $o->status === StoreOrder::PAID && $o->fulfilled_at === null ? $o->error : null,
            'box' => $o->box_id ? Box::query()->whereKey($o->box_id)->value('uuid') : null,
            'server' => $o->server_id ? Server::query()->whereKey($o->server_id)->value('uuidShort') : null,
            'paid_at' => $o->paid_at?->toIso8601String(),
            'created_at' => $o->created_at?->toIso8601String(),
        ];
    }
}

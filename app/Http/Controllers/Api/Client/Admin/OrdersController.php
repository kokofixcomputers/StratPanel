<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\StoreOrder;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Store\StoreService;
use Pterodactyl\Http\Controllers\Api\Client\Admin\Concerns\FormatsAdminResponses;

/** Admin > Orders: what was bought in the store, refunds, and orders that were paid but could not be set up. */
class OrdersController extends Controller
{
    use FormatsAdminResponses;

    public function __construct(private StoreService $store)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $query = StoreOrder::query()->with(['user:id,username,email', 'items'])->where('status', '!=', StoreOrder::PENDING);
        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(fn ($q) => $q->where('package_name', 'like', '%' . $search . '%')->orWhere('uuid', $search)
                ->orWhereHas('user', fn ($u) => $u->where('username', 'like', $search . '%')->orWhere('email', 'like', $search . '%')));
        }
        $orders = $query->orderByDesc('id')->paginate(25);

        return new JsonResponse([
            'orders' => $orders->getCollection()->map(fn (StoreOrder $o) => [
                'id' => $o->id,
                'uuid' => $o->uuid,
                'user' => ['id' => $o->user->id, 'username' => $o->user->username],
                'package' => $o->package_name,
                'amount' => $o->amount,
                'currency' => $o->currency,
                'provider' => $o->provider,
                'status' => $o->status,
                'items' => $o->items->map(fn ($i) => ['name' => $i->package_name, 'kind' => $i->kind, 'renewal' => $i->renewal, 'box_id' => $i->box_id, 'server_id' => $i->server_id, 'done' => $i->fulfilled_at !== null, 'error' => $i->error])->values()->all(),
                'setting_up' => $o->isSettingUp(),
                'error' => $o->error,
                'paid_at' => $o->paid_at?->toIso8601String(),
                'created_at' => $o->created_at?->toIso8601String(),
            ])->values()->all(),
            'pagination' => $this->pagination($orders),
        ]);
    }

    /** @throws \Pterodactyl\Exceptions\DisplayException */
    public function refund(Request $request, int $order): JsonResponse
    {
        $found = StoreOrder::query()->findOrFail($order);
        $this->store->refund($found, $request->boolean('revoke'));
        Activity::event('order:refund')->property(['order' => $found->uuid, 'revoked' => $request->boolean('revoke')])->log();

        return new JsonResponse(['status' => $found->status]);
    }

    /** Tries again to make what a paid order bought. */
    public function fulfill(int $order): JsonResponse
    {
        $found = $this->store->fulfill(StoreOrder::query()->findOrFail($order));
        Activity::event('order:fulfill')->property(['order' => $found->uuid])->log();

        return new JsonResponse(['setting_up' => $found->isSettingUp(), 'error' => $found->error]);
    }
}

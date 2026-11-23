<?php

namespace Pterodactyl\Http\Controllers\Api\Store;

use Illuminate\Http\Request;
use Pterodactyl\Models\StoreOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Pterodactyl\Services\Store\StoreService;
use Pterodactyl\Exceptions\DisplayException;

class WebhookController extends Controller
{
    public function __construct(private StoreService $store)
    {
    }

    /** A payment service says something about a payment. Only what the service proves is acted on. */
    public function __invoke(Request $request, string $provider): JsonResponse
    {
        try {
            $service = $this->store->provider($provider);
        } catch (DisplayException) {
            return new JsonResponse(['received' => false], 404);
        }

        try {
            $news = $service->webhook($request);
        } catch (\Throwable $e) {
            report($e);

            return new JsonResponse(['received' => false], 500);
        }

        if ($news !== null && ($order = StoreOrder::query()->where('uuid', $news['order'])->where('provider', $provider)->first())) {
            $this->store->settle($order, $news['status']);
        }

        return new JsonResponse(['received' => true]);
    }
}

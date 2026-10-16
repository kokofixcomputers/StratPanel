<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\AuthProvider;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Auth\AuthSettings;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/**
 * The services the logged in user signed in with, and the ones they can still link (Account > Providers).
 */
class ProviderController extends ClientApiController
{
    public function __construct(private AuthSettings $settings)
    {
        parent::__construct();
    }

    public function index(ClientApiRequest $request): JsonResponse
    {
        $user = $request->user();
        $linked = $user->identities()->with('provider')->get()->keyBy('auth_provider_id');

        // A service an admin switched off stays in the list while it is linked, so it can be unlinked.
        $providers = AuthProvider::query()->orderBy('id')->get()->filter(
            fn (AuthProvider $provider) => $provider->enabled || $linked->has($provider->id)
        );

        return new JsonResponse([
            'password_set' => (bool) $user->password_set,
            'data' => $providers->values()->map(function (AuthProvider $provider) use ($linked) {
                $identity = $linked->get($provider->id);

                return [
                    'key' => $provider->key,
                    'name' => $provider->name,
                    'type' => $provider->type,
                    'enabled' => $provider->enabled,
                    'linked' => $identity !== null,
                    'account' => $identity?->display_name ?: $identity?->email,
                    'linked_at' => $identity?->created_at?->toIso8601String(),
                    'last_used_at' => $identity?->last_used_at?->toIso8601String(),
                ];
            })->all(),
        ]);
    }

    /**
     * @throws DisplayException
     */
    public function delete(ClientApiRequest $request, string $key): JsonResponse
    {
        $user = $request->user();
        $identity = $user->identities()->whereHas('provider', fn ($query) => $query->where('key', $key))->first();
        if ($identity === null) {
            return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
        }

        // Unlinking the last way in of an account that has no password would lock its owner out.
        if (!$user->password_set && $user->identities()->count() + $user->passkeys()->count() <= 1) {
            throw new DisplayException('This is the only way you can sign in. Set a password first (under Account), then unlink it.');
        }

        $identity->delete();

        Activity::event('user:account.provider-unlinked')->subject($user)->property(['provider' => $key])->log();

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }
}

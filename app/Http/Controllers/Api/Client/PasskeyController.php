<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Auth\AuthSettings;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Services\Auth\Passkeys\PasskeyException;
use Pterodactyl\Services\Auth\Passkeys\PasskeyService;

/**
 * The passkeys of the logged in user (Account > Passkeys).
 */
class PasskeyController extends ClientApiController
{
    public function __construct(private PasskeyService $passkeys, private AuthSettings $settings)
    {
        parent::__construct();
    }

    public function index(ClientApiRequest $request): JsonResponse
    {
        return new JsonResponse([
            'enabled' => $this->settings->passkeysEnabled(),
            'data' => $request->user()->passkeys()->orderBy('id')->get()->map(fn ($key) => [
                'id' => $key->id,
                'name' => $key->name,
                'created_at' => $key->created_at?->toIso8601String(),
                'last_used_at' => $key->last_used_at?->toIso8601String(),
            ])->all(),
        ]);
    }

    /** The challenge for adding a passkey. */
    public function options(ClientApiRequest $request): JsonResponse
    {
        abort_unless($this->settings->passkeysEnabled(), 404);

        return new JsonResponse($this->passkeys->registrationOptions($request, $request->user()));
    }

    /**
     * @throws DisplayException
     */
    public function store(ClientApiRequest $request): JsonResponse
    {
        abort_unless($this->settings->passkeysEnabled(), 404);

        $data = $request->validate(['name' => 'nullable|string|max:100', 'credential' => 'required|array']);

        try {
            $key = $this->passkeys->register($request, $request->user(), (string) ($data['name'] ?? ''), $data['credential']);
        } catch (PasskeyException $exception) {
            throw new DisplayException($exception->getMessage());
        }

        return new JsonResponse([
            'id' => $key->id,
            'name' => $key->name,
            'created_at' => $key->created_at?->toIso8601String(),
            'last_used_at' => null,
        ], JsonResponse::HTTP_CREATED);
    }

    /**
     * @throws DisplayException
     */
    public function delete(ClientApiRequest $request, int $id): JsonResponse
    {
        $user = $request->user();
        $key = $user->passkeys()->where('id', $id)->first();
        if ($key === null) {
            return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
        }

        // Removing the last way in of an account without a password would lock its owner out.
        if (!$user->password_set && $user->passkeys()->count() + $user->identities()->count() <= 1) {
            throw new DisplayException('This is the only way you can sign in. Set a password first (under Account), then remove it.');
        }

        $key->delete();
        Activity::event('user:account.passkey-removed')->subject($user)->property(['name' => $key->name])->log();

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }
}

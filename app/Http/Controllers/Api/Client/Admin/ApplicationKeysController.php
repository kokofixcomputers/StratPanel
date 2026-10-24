<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\ApiKey;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Services\Acl\Api\AdminAcl;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Api\KeyCreationService;
use Pterodactyl\Http\Requests\Admin\Api\StoreApplicationApiKeyRequest;

/** The keys of the application API for the admin pages. */
class ApplicationKeysController extends Controller
{
    public function __construct(private KeyCreationService $keyCreationService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $keys = ApiKey::query()->with('user')->where('key_type', ApiKey::TYPE_APPLICATION)->get();

        return new JsonResponse([
            'keys' => $keys->map(fn (ApiKey $key) => [
                'identifier' => $key->identifier,
                // Only the person who made a key sees all of it.
                'key' => $request->user()->is($key->user) ? $key->identifier . decrypt($key->token) : $key->identifier . '****',
                'memo' => $key->memo,
                'last_used_at' => $key->last_used_at?->toIso8601String(),
                'created_at' => $key->created_at->toIso8601String(),
                'user' => ['id' => $key->user->id, 'username' => $key->user->username],
            ])->values()->all(),
        ]);
    }

    /** The things a key can be given access to, and the numbers that stand for the levels. */
    public function resources(): JsonResponse
    {
        $resources = AdminAcl::getResourceList();
        sort($resources);

        return new JsonResponse([
            'resources' => $resources,
            'levels' => ['none' => AdminAcl::NONE, 'read' => AdminAcl::READ, 'write' => AdminAcl::READ | AdminAcl::WRITE],
        ]);
    }

    /** @throws \Pterodactyl\Exceptions\Model\DataValidationException */
    public function store(StoreApplicationApiKeyRequest $request): JsonResponse
    {
        $key = $this->keyCreationService->setKeyType(ApiKey::TYPE_APPLICATION)->handle([
            'memo' => $request->input('memo'),
            'user_id' => $request->user()->id,
        ], $request->getKeyPermissions());

        return new JsonResponse(['identifier' => $key->identifier], 201);
    }

    public function destroy(string $identifier): JsonResponse
    {
        ApiKey::query()->where('key_type', ApiKey::TYPE_APPLICATION)->where('identifier', $identifier)->delete();

        return new JsonResponse([], 204);
    }
}

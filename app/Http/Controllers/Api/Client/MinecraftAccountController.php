<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Minecraft\MinecraftLinkService;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/**
 * The Minecraft account linked to the logged in user (Account > Minecraft account), and finding the account somebody linked by its name.
 */
class MinecraftAccountController extends ClientApiController
{
    public function __construct(private MinecraftLinkService $links)
    {
        parent::__construct();
    }

    public function index(ClientApiRequest $request): JsonResponse
    {
        return new JsonResponse($this->describe($request));
    }

    /** @throws DisplayException */
    public function store(ClientApiRequest $request): JsonResponse
    {
        if (!$this->links->enabled()) {
            throw new DisplayException('Linking Minecraft accounts is not turned on.');
        }

        $data = $request->validate(['code' => 'required|string|max:16']);
        $user = $this->links->link($request->user(), $data['code']);

        Activity::event('user:account.minecraft-linked')->property('username', $user->minecraft_username)->log();

        return new JsonResponse($this->describe($request));
    }

    public function delete(ClientApiRequest $request): JsonResponse
    {
        $this->links->unlink($request->user());

        Activity::event('user:account.minecraft-unlinked')->log();

        return new JsonResponse($this->describe($request));
    }

    /**
     * Whether somebody linked this Minecraft name, for the invite of a subuser. Only the name and the head are given, never whose
     * account it is.
     */
    public function lookup(ClientApiRequest $request): JsonResponse
    {
        $data = $request->validate(['username' => ['required', 'string', 'regex:/^\w{1,16}$/']]);
        $user = $this->links->enabled() ? $this->links->findByName($data['username']) : null;

        return new JsonResponse(['found' => $user !== null, 'username' => $user?->minecraft_username, 'avatar' => MinecraftLinkService::avatar($user?->minecraft_uuid)]);
    }

    /** @return array<string, mixed> */
    private function describe(ClientApiRequest $request): array
    {
        $user = $request->user()->refresh();

        return [
            'enabled' => $this->links->enabled(),
            'minutes' => MinecraftLinkService::MINUTES,
            'linked' => $user->minecraft_uuid !== null,
            'username' => $user->minecraft_username,
            'uuid' => $user->minecraft_uuid,
            'avatar' => MinecraftLinkService::avatar($user->minecraft_uuid),
            // Where players join to get a code, when the admin said.
            'join' => $this->links->address(),
        ];
    }
}

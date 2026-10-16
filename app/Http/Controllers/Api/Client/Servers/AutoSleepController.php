<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\ServerAutoSleep;
use Pterodactyl\Services\Servers\AutoSleep\AutoSleepService;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Settings\UpdateAutoSleepRequest;

class AutoSleepController extends ClientApiController
{
    public function __construct(private AutoSleepService $service)
    {
        parent::__construct();
    }

    /** What auto sleep is set to, and whether the server is asleep. Everybody who can see the server may see it. */
    public function index(ClientApiRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse($this->attributes($server));
    }

    public function update(UpdateAutoSleepRequest $request, Server $server): JsonResponse
    {
        $this->service->update(
            $server,
            $request->boolean('enabled'),
            (int) $request->input('idle_minutes'),
            $request->boolean('wake_on_join')
        );

        return new JsonResponse($this->attributes($server));
    }

    /** @return array<string, mixed> */
    private function attributes(Server $server): array
    {
        $settings = $this->service->settings($server);

        return [
            'enabled' => $settings->enabled,
            'idle_minutes' => $settings->idle_minutes,
            'wake_on_join' => $settings->wake_on_join,
            'sleeping' => $settings->enabled && !is_null($settings->slept_at),
            'idle_since' => $settings->idle_since?->toIso8601String(),
            'slept_at' => $settings->slept_at?->toIso8601String(),
            // A player can only start a sleeping server through the router, which needs a domain that points at it.
            'wake_available' => (string) config('pterodactyl.domains.router_token') !== '' && $this->service->hasDomain($server),
            'choices' => ServerAutoSleep::IDLE_CHOICES,
        ];
    }
}

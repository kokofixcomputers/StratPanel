<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\ServerEnvironmentVariable;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Startup\GetStartupRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Startup\ManageEnvironmentRequest;

/**
 * Environment variables that users add to their own server. They are sent to the daemon together with the variables
 * of the egg the next time the server starts.
 */
class EnvironmentVariableController extends ClientApiController
{
    public function index(GetStartupRequest $request, Server $server): array
    {
        return [
            'object' => 'list',
            'data' => $server->environmentVariables()->orderBy('key')->get()->map(fn ($v) => $this->transform($v))->all(),
            'meta' => ['max' => ServerEnvironmentVariable::MAX_PER_SERVER],
        ];
    }

    /**
     * Creates a variable, or changes the value when the name already exists.
     *
     * @throws \Illuminate\Validation\ValidationException
     * @throws \Pterodactyl\Exceptions\DisplayException
     */
    public function store(ManageEnvironmentRequest $request, Server $server): array
    {
        $data = $this->validate($request, [
            'key' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z_][A-Za-z0-9_]*$/'],
            'value' => ['present', 'nullable', 'string', 'max:2048'],
        ], [
            'key.regex' => 'Names can only contain letters, numbers and underscores, and cannot start with a number.',
        ]);

        $key = $data['key'];
        $taken = $server->variables()->pluck('env_variable')->merge(array_keys(config('pterodactyl.environment_variables', [])))
            ->merge(array_keys($this->environmentKeys()))
            ->all();
        if (ServerEnvironmentVariable::isReserved($key, $taken)) {
            throw new DisplayException("$key is used by the panel or by the egg of this server and cannot be changed here.");
        }

        $existing = $server->environmentVariables()->where('key', $key)->first();
        if (is_null($existing) && $server->environmentVariables()->count() >= ServerEnvironmentVariable::MAX_PER_SERVER) {
            throw new DisplayException('A server can have at most ' . ServerEnvironmentVariable::MAX_PER_SERVER . ' custom variables.');
        }

        $variable = $server->environmentVariables()->updateOrCreate(['key' => $key], ['value' => (string) ($data['value'] ?? '')]);

        Activity::event('server:startup.env.set')->property(['variable' => $key])->log();

        return $this->transform($variable);
    }

    public function destroy(ManageEnvironmentRequest $request, Server $server, string $key): JsonResponse
    {
        $deleted = $server->environmentVariables()->where('key', $key)->delete();
        if ($deleted) {
            Activity::event('server:startup.env.delete')->property(['variable' => $key])->log();
        }

        return new JsonResponse([], 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function transform(ServerEnvironmentVariable $variable): array
    {
        return ['key' => $variable->key, 'value' => $variable->value];
    }

    /**
     * @return array<string, callable>
     */
    private function environmentKeys(): array
    {
        return app(\Pterodactyl\Services\Servers\EnvironmentService::class)->getEnvironmentKeys();
    }
}

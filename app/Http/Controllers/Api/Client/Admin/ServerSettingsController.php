<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Allocation;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Exceptions\Model\DataValidationException;
use Pterodactyl\Services\Servers\EnvironmentService;
use Pterodactyl\Services\Servers\BuildModificationService;
use Pterodactyl\Services\Servers\StartupModificationService;

/** The build (resources and allocations) and the startup (command, egg, image, variables) of a server, for the admin pages. */
class ServerSettingsController extends Controller
{
    public function __construct(
        private BuildModificationService $build,
        private StartupModificationService $startup,
        private EnvironmentService $environment,
    ) {
    }

    public function build(int $serverId): JsonResponse
    {
        return new JsonResponse($this->buildState(Server::query()->with('node.allocations')->findOrFail($serverId)));
    }

    public function updateBuild(Request $request, int $serverId): JsonResponse
    {
        $server = Server::query()->findOrFail($serverId);

        try {
            $this->build->handle($server, $request->only([
                'allocation_id', 'add_allocations', 'remove_allocations',
                'memory', 'swap', 'io', 'cpu', 'threads', 'disk',
                'database_limit', 'allocation_limit', 'backup_limit', 'oom_disabled',
            ]));
        } catch (DataValidationException $exception) {
            throw new ValidationException($exception->getValidator());
        }

        return new JsonResponse($this->buildState(Server::query()->with('node.allocations')->findOrFail($serverId)));
    }

    public function startup(int $serverId): JsonResponse
    {
        return new JsonResponse($this->startupState(Server::query()->findOrFail($serverId)));
    }

    public function updateStartup(Request $request, int $serverId): JsonResponse
    {
        $server = Server::query()->findOrFail($serverId);
        $data = $request->only(['startup', 'nest_id', 'egg_id', 'skip_scripts', 'docker_image', 'environment']);

        try {
            $this->startup->setUserLevel(User::USER_LEVEL_ADMIN)->handle($server, $data);
        } catch (DataValidationException $exception) {
            throw new ValidationException($exception->getValidator());
        }

        return new JsonResponse($this->startupState(Server::query()->findOrFail($serverId)));
    }

    /** @return array<string, mixed> */
    private function buildState(Server $server): array
    {
        $allocations = $server->node->allocations->toBase();
        $option = fn (Allocation $a) => ['id' => $a->id, 'text' => $a->alias . ':' . $a->port];

        return [
            'id' => $server->id,
            'name' => $server->name,
            'cpu' => (int) $server->cpu,
            'threads' => (string) $server->threads,
            'memory' => (int) $server->memory,
            'swap' => (int) $server->swap,
            'disk' => (int) $server->disk,
            'io' => (int) $server->io,
            'oom_disabled' => (bool) $server->oom_disabled,
            'database_limit' => $server->database_limit,
            'allocation_limit' => $server->allocation_limit,
            'backup_limit' => $server->backup_limit,
            'allocation_id' => $server->allocation_id,
            'assigned' => $allocations->where('server_id', $server->id)->sortBy('port')->sortBy('ip')->map($option)->values()->all(),
            'unassigned' => $allocations->where('server_id', null)->sortBy('port')->sortBy('ip')->map($option)->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function startupState(Server $server): array
    {
        return [
            'id' => $server->id,
            'name' => $server->name,
            'startup' => $server->startup,
            'image' => $server->image,
            'skip_scripts' => (bool) $server->skip_scripts,
            'nest_id' => $server->nest_id,
            'egg_id' => $server->egg_id,
            // What each variable of the egg of this server is now.
            'environment' => (object) $this->environment->handle($server),
            'nests' => Nest::query()->with('eggs.variables')->orderBy('name')->get()->map(fn (Nest $nest) => [
                'id' => $nest->id,
                'name' => $nest->name,
                'eggs' => $nest->eggs->sortBy('name')->map(fn ($egg) => [
                    'id' => $egg->id,
                    'name' => $egg->name,
                    'docker_images' => $egg->docker_images,
                    'startup' => $egg->startup,
                    'variables' => $egg->variables->map(fn ($variable) => [
                        'id' => $variable->id,
                        'name' => $variable->name,
                        'description' => (string) $variable->description,
                        'env_variable' => $variable->env_variable,
                        'default_value' => (string) $variable->default_value,
                        'rules' => $variable->rules,
                        'required' => str_contains((string) $variable->rules, 'required'),
                    ])->values()->all(),
                ])->values()->all(),
            ])->values()->all(),
        ];
    }
}

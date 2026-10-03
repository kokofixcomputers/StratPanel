<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Node;
use Illuminate\Support\Collection;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\Objects\DeploymentObject;
use Pterodactyl\Services\Servers\ServerCreationService;
use Pterodactyl\Services\Deployment\AllocationSelectionService;
use Pterodactyl\Transformers\Api\Client\ServerTransformer;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Http\Requests\Api\Client\CreateServerRequest;

class SelfServiceController extends ClientApiController
{
    /**
     * SelfServiceController constructor.
     */
    public function __construct(
        private ServerCreationService $creationService,
        private AllocationSelectionService $allocationSelectionService,
    ) {
        parent::__construct();
    }

    /**
     * Returns whether the current user may create a server for themselves and what it would get.
     */
    public function index(ClientApiRequest $request): array
    {
        $config = config('pterodactyl.self_service');
        $max = $this->maxServers($request);
        $owned = Server::query()->where('owner_id', $request->user()->id)->count();

        return [
            'object' => 'self_service',
            'attributes' => [
                'enabled' => (bool) $config['enabled'],
                'can_create' => (bool) $config['enabled'] && ($max === 0 || $owned < $max),
                'max_servers' => $max,
                'owned' => $owned,
                'limits' => [
                    'memory' => (int) $config['memory'],
                    'disk' => (int) $config['disk'],
                    'cpu' => (int) $config['cpu'],
                ],
                'nodes' => $this->availableNodes()->map(function (Node $node) {
                    $memoryLimit = $node->memory * (1 + ($node->memory_overallocate / 100));
                    $diskLimit = $node->disk * (1 + ($node->disk_overallocate / 100));

                    return [
                        'id' => $node->id,
                        'name' => $node->name,
                        'location' => $node->location?->short,
                        'description' => $node->location?->long,
                        'ping_url' => $node->getConnectionAddress(),
                        // @phpstan-ignore-next-line property.notFound
                        'memory_free' => max(0, (int) floor($memoryLimit - $node->sum_memory)),
                        // @phpstan-ignore-next-line property.notFound
                        'disk_free' => max(0, (int) floor($diskLimit - $node->sum_disk)),
                        // @phpstan-ignore-next-line property.notFound
                        'free_allocations' => (int) $node->free_allocations,
                    ];
                })->values()->all(),
                'max' => [
                    'memory' => max(512, (int) $config['max_memory'], (int) $config['memory']),
                    'disk' => max(1024, (int) $config['max_disk'], (int) $config['disk']),
                    'cpu' => max(50, (int) $config['max_cpu'], (int) $config['cpu']),
                ],
            ],
        ];
    }

    /**
     * Creates a new Minecraft server owned by the current user on any node that has room for it.
     *
     * @throws \Throwable
     */
    public function store(CreateServerRequest $request): JsonResponse
    {
        $config = config('pterodactyl.self_service');
        if (!$config['enabled']) {
            throw new DisplayException('Creating servers is not enabled on this panel.');
        }

        $user = $request->user();
        $max = $this->maxServers($request);
        if ($max > 0 && Server::query()->where('owner_id', $user->id)->count() >= $max) {
            throw new DisplayException("You have reached the limit of $max servers for your account.");
        }

        $egg = $this->resolveEgg($config['egg']);

        // Every variable needs a value, use the egg defaults so the installation script can run unattended.
        $environment = [];
        foreach ($egg->variables as $variable) {
            $environment[$variable->env_variable] = $variable->default_value;
        }

        // Start on the newest Java image the egg offers, the Versions tab switches it if a build needs another one.
        $image = $this->newestJavaImage($egg->docker_images ?? []);

        // A plain Java egg has nothing to install, the Versions tab puts the server software in place instead.
        $skipScripts = (bool) ($config['skip_scripts'] ?? preg_match('/^java/i', $egg->name));

        $memory = (int) $request->input('memory', $config['memory']);
        $disk = (int) $request->input('disk', $config['disk']);
        $placement = [];
        $deployment = null;

        if ($request->filled('node_id')) {
            // The user picked a node, make sure it is one they may use and that the server fits on it.
            $node = $this->availableNodes()->firstWhere('id', (int) $request->input('node_id'));
            // @phpstan-ignore-next-line property.notFound
            if (is_null($node) || !$node->isViable($memory, $disk) || (int) $node->free_allocations < 1) {
                throw new DisplayException('The selected node does not have enough free resources for this server.');
            }

            $allocation = $this->allocationSelectionService->setDedicated(false)->setNodes([$node->id])->setPorts([])->handle();
            $placement = ['node_id' => $node->id, 'allocation_id' => $allocation->id];
        } else {
            $deployment = (new DeploymentObject())
                ->setDedicated(false)
                ->setLocations($config['locations'] ?? [])
                ->setPorts([]);
        }

        $server = $this->creationService->handle(array_merge([
            'external_id' => null,
            'name' => $request->input('name'),
            'description' => $request->input('description'),
            'owner_id' => $user->id,
            'egg_id' => $egg->id,
            'nest_id' => $egg->nest_id,
            'image' => $image,
            'startup' => $egg->startup,
            'environment' => $environment,
            'memory' => $memory,
            'swap' => 0,
            'disk' => $disk,
            'io' => 500,
            'cpu' => (int) $request->input('cpu', $config['cpu']),
            'threads' => null,
            'skip_scripts' => $skipScripts,
            'oom_disabled' => true,
            'database_limit' => (int) $config['databases'],
            'allocation_limit' => (int) $config['allocations'],
            'backup_limit' => (int) $config['backups'],
            'start_on_completion' => false,
        ], $placement), $deployment);

        return $this->fractal->item($server)
            ->transformWith($this->getTransformer(ServerTransformer::class))
            ->respond(201);
    }

    /**
     * Public nodes that are not in maintenance, with the memory and disk that is already promised to servers.
     *
     * @return \Illuminate\Support\Collection<int, \Pterodactyl\Models\Node>
     */
    private function availableNodes(): Collection
    {
        $query = Node::query()->select('nodes.*')
            ->selectRaw('IFNULL(SUM(servers.memory), 0) as sum_memory')
            ->selectRaw('IFNULL(SUM(servers.disk), 0) as sum_disk')
            ->selectRaw('(SELECT COUNT(*) FROM allocations WHERE allocations.node_id = nodes.id AND allocations.server_id IS NULL) as free_allocations')
            ->leftJoin('servers', 'servers.node_id', '=', 'nodes.id')
            ->where('nodes.public', 1)
            ->where('nodes.maintenance_mode', 0);

        $locations = config('pterodactyl.self_service.locations');
        if (!empty($locations)) {
            $query->whereIn('nodes.location_id', $locations);
        }

        return $query->groupBy('nodes.id')->with('location')->get();
    }

    /**
     * Root administrators may create as many servers as they like.
     */
    private function maxServers(ClientApiRequest $request): int
    {
        return $request->user()->root_admin ? 0 : (int) config('pterodactyl.self_service.max_servers');
    }

    /**
     * Picks the docker image with the highest Java version, falling back to the first one listed.
     *
     * @param array<string, string> $images
     */
    private function newestJavaImage(array $images): string
    {
        $best = null;
        $bestVersion = -1;
        foreach ($images as $image) {
            if (preg_match('/java[_:-]?(\d+)/i', (string) $image, $matches) && (int) $matches[1] > $bestVersion) {
                $bestVersion = (int) $matches[1];
                $best = $image;
            }
        }

        return $best ?? (string) (reset($images) ?: '');
    }

    /**
     * Finds the egg new servers are created from. A plain "Java" egg is preferred, the Versions tab installs the
     * actual software afterwards so any Minecraft egg also works as the starting point.
     *
     * @throws \Pterodactyl\Exceptions\DisplayException
     */
    private function resolveEgg(mixed $configured): Egg
    {
        $query = Egg::query()->with('variables');

        if (!empty($configured)) {
            $egg = (clone $query)->find((int) $configured);
            if (!is_null($egg)) {
                return $egg;
            }
        }

        foreach (['Java', 'Paper', 'Vanilla'] as $name) {
            $egg = (clone $query)->where('name', 'like', "%$name%")->first();
            if (!is_null($egg)) {
                return $egg;
            }
        }

        $egg = (clone $query)->whereHas('nest', function ($nest) {
            $nest->where('name', 'like', '%Minecraft%');
        })->first();

        if (is_null($egg)) {
            throw new DisplayException('No Minecraft egg is available to create a server with, ask an administrator to import one.');
        }

        return $egg;
    }
}

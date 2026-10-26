<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Node;
use Illuminate\Support\Collection;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\Objects\DeploymentObject;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Services\Servers\SelfServiceEgg;
use Pterodactyl\Services\Servers\ServerCreationService;
use Pterodactyl\Services\Deployment\AllocationSelectionService;
use Pterodactyl\Services\Allocations\FindAssignableAllocationService;
use Pterodactyl\Exceptions\Service\Allocation\NoAutoAllocationSpaceAvailableException;
use Illuminate\Support\Facades\DB;
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
        private FindAssignableAllocationService $findAssignableAllocationService,
        private ResourcePool $pools,
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
        // The panel's switch, unless a role of this person says otherwise.
        $enabled = $request->user()->allowedTo('self.servers.create', (bool) $config['enabled']);

        // With resource pools the servers are paid from the pool, not counted: what is left decides what can be picked.
        $pooled = $this->pools->appliesTo($request->user());
        $remaining = $pooled ? $this->pools->remaining($request->user()) : null;
        $start = ['memory' => (int) $config['memory'], 'disk' => (int) $config['disk'], 'cpu' => (int) $config['cpu'], 'allocations' => 2, 'backups' => (int) $config['backups'], 'databases' => (int) $config['databases']];
        if ($pooled) {
            $start = $this->pools->fit($request->user(), $start);
        }
        $ceiling = [
            'memory' => max(512, (int) $config['max_memory'], (int) $config['memory']),
            'disk' => max(1024, (int) $config['max_disk'], (int) $config['disk']),
            'cpu' => max(50, (int) $config['max_cpu'], (int) $config['cpu']),
        ];
        if ($pooled) {
            // Never more than is left, and never less than the least a server can have (the page needs a slider with room on it).
            foreach (['memory', 'disk', 'cpu'] as $resource) {
                $ceiling[$resource] = max(ResourcePool::MINIMUM[$resource], min($ceiling[$resource], $remaining[$resource]));
            }
        }

        return [
            'object' => 'self_service',
            'attributes' => [
                'enabled' => $enabled,
                'can_create' => $enabled && ($pooled ? $this->pools->canCreate($request->user()) : ($max === 0 || $owned < $max)),
                // The pool of this person: what they have, what the servers use and what is left. Null without resource pools.
                'pool' => $pooled ? [
                    'limits' => $this->pools->limits($request->user()),
                    'used' => $this->pools->used($request->user()),
                    'remaining' => $remaining,
                    'minimum' => ResourcePool::MINIMUM,
                ] : null,
                'max_servers' => $max,
                'owned' => $owned,
                'limits' => [
                    'memory' => $start['memory'],
                    'disk' => $start['disk'],
                    'cpu' => $start['cpu'],
                    // How many allocations the server starts with: two without a pool, one at least.
                    'allocations' => $start['allocations'],
                    'backups' => $start['backups'],
                    'databases' => $start['databases'],
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
                    'memory' => $ceiling['memory'],
                    'disk' => $ceiling['disk'],
                    'cpu' => $ceiling['cpu'],
                    'allocations' => $pooled ? max(1, $remaining['allocations']) : $this->ceilings($request->user(), $config)['allocations'],
                    // Without a pool the advanced options go up to what the panel allows (admins who may create servers have more room).
                    'backups' => $pooled ? $remaining['backups'] : $this->ceilings($request->user(), $config)['backups'],
                    'databases' => $pooled ? $remaining['databases'] : $this->ceilings($request->user(), $config)['databases'],
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
        $user = $request->user();
        $pooled = $this->pools->appliesTo($user);
        if ($user->permissionState('self.servers.create') === 'deny') {
            throw new DisplayException('Your account is not allowed to create servers.');
        }
        if (!$user->allowedTo('self.servers.create', (bool) $config['enabled'])) {
            throw new DisplayException('Creating servers is not enabled on this panel.');
        }

        $max = $this->maxServers($request);
        // With a pool it is the resources that run out, not a number of servers.
        if (!$pooled && $max > 0 && Server::query()->where('owner_id', $user->id)->count() >= $max) {
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
        $cpu = (int) $request->input('cpu', $config['cpu']);
        $allocations = $pooled ? max(1, (int) $request->input('allocations', 2)) : 2;
        $backups = (int) $config['backups'];
        $databases = (int) $config['databases'];
        if (!$pooled) {
            // The advanced options: what was asked for, up to what the panel allows.
            $ceilings = $this->ceilings($user, $config);
            if ($request->has('backups')) {
                $backups = min(max(0, (int) $request->input('backups')), $ceilings['backups']);
            }
            if ($request->has('databases')) {
                $databases = min(max(0, (int) $request->input('databases')), $ceilings['databases']);
            }
            if ($request->has('allocations')) {
                $allocations = min(max(1, (int) $request->input('allocations')), $ceilings['allocations']);
            }
        }
        if ($pooled) {
            // What was not asked for is the usual size, cut down to what is left; what was asked for has to fit as it is.
            $backups = (int) $request->input('backups', $config['backups']);
            $databases = (int) $request->input('databases', $config['databases']);
            $usual = $this->pools->fit($user, ['memory' => $memory, 'disk' => $disk, 'cpu' => $cpu, 'allocations' => $allocations, 'backups' => $backups, 'databases' => $databases]);
            $memory = $request->has('memory') ? $memory : $usual['memory'];
            $disk = $request->has('disk') ? $disk : $usual['disk'];
            $cpu = $request->has('cpu') ? $cpu : $usual['cpu'];
            $allocations = $request->has('allocations') ? $allocations : max(1, $usual['allocations']);
            $backups = $request->has('backups') ? $backups : $usual['backups'];
            $databases = $request->has('databases') ? $databases : $usual['databases'];
            $this->pools->check($user, ['memory' => $memory, 'disk' => $disk, 'cpu' => $cpu, 'allocations' => $allocations, 'backups' => $backups, 'databases' => $databases]);
            foreach (['memory' => $memory, 'disk' => $disk, 'cpu' => $cpu] as $resource => $value) {
                if ($value < ResourcePool::MINIMUM[$resource]) {
                    throw new DisplayException('Your resource pool has too little ' . $resource . ' left to make another server.');
                }
            }
        }
        $placement = [];
        $deployment = null;

        if ($request->filled('node_id')) {
            // The user picked a node, make sure it is one they may use and that it has a free port. Memory and disk are not checked.
            $node = $this->availableNodes()->firstWhere('id', (int) $request->input('node_id'));
            // @phpstan-ignore-next-line property.notFound
            if (is_null($node) || (int) $node->free_allocations < 1) {
                throw new DisplayException('The selected node has no free port for this server.');
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
            'cpu' => $cpu,
            'threads' => null,
            'skip_scripts' => $skipScripts,
            'oom_disabled' => true,
            'database_limit' => $databases,
            // At least the two allocations a server starts with, the setting is how many it may have in total. With a pool it is the whole pool
            // of the person: how many they really get is decided by what is left of it (see NetworkAllocationController).
            'allocation_limit' => $pooled ? max($allocations, $this->pools->limits($user)['allocations']) : max($allocations, 2, (int) $config['allocations']),
            'backup_limit' => $backups,
            'start_on_completion' => false,
        ], $placement), $deployment);

        // A server starts with two allocations: the one it is played on and one more, for things like a voice chat plugin
        // or a web map. A node with a single free port gives a server with just that one.
        // With a pool the person chose how many (the first one is the primary), otherwise it is always the one more.
        for ($i = 1; $i < $allocations; $i++) {
            try {
                DB::transaction(function () use ($server) {
                    $this->findAssignableAllocationService->handle($server->loadMissing(['node', 'allocation']));
                });
                $server->unsetRelation('allocations');
            } catch (NoAutoAllocationSpaceAvailableException) {
                // Nothing to add, the server keeps what it has.
                break;
            }
        }

        return $this->fractal->item($server)
            ->transformWith($this->getTransformer(ServerTransformer::class))
            ->respond(201);
    }

    /**
     * The most a person without a pool may pick in the advanced options of the create page. Whoever may create servers in the admin
     * area has plenty of room, everybody else gets what the panel allows.
     *
     * @param  array<string, mixed>  $config
     * @return array{allocations: int, backups: int, databases: int}
     */
    private function ceilings(\Pterodactyl\Models\User $user, array $config): array
    {
        if ($user->hasPermission('servers.create')) {
            return ['allocations' => 20, 'backups' => 100, 'databases' => 20];
        }

        return [
            'allocations' => max(2, (int) $config['allocations']),
            'backups' => max((int) $config['backups'], (int) ($config['max_backups'] ?? 0)),
            'databases' => max((int) $config['databases'], (int) ($config['max_databases'] ?? 0)),
        ];
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
        return $request->user()->hasPermission('servers.create') ? 0 : (int) config('pterodactyl.self_service.max_servers');
    }

    /** @throws \Pterodactyl\Exceptions\DisplayException */
    private function resolveEgg(mixed $configured): Egg
    {
        return app(SelfServiceEgg::class)->resolve($configured);
    }

    /** @param array<string, string> $images */
    private function newestJavaImage(array $images): string
    {
        return app(SelfServiceEgg::class)->newestJavaImage($images);
    }
}

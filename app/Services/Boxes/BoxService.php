<?php

namespace Pterodactyl\Services\Boxes;

use Pterodactyl\Models\Box;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\Objects\DeploymentObject;
use Pterodactyl\Services\Servers\SelfServiceEgg;
use Pterodactyl\Services\Servers\SuspensionService;
use Pterodactyl\Services\Servers\ServerCreationService;
use Pterodactyl\Services\Servers\ServerDeletionService;
use Pterodactyl\Services\Servers\BuildModificationService;
use Pterodactyl\Services\Deployment\AllocationSelectionService;
use Pterodactyl\Services\Allocations\FindAssignableAllocationService;
use Pterodactyl\Exceptions\Service\Allocation\NoAutoAllocationSpaceAvailableException;

/**
 * Boxes: a person owns memory, disk, CPU, ports, backups and databases (made by an admin, or bought in the store) and makes servers inside of
 * them, choosing how much of the box each server gets. What a box has left is counted from the servers in it, there is no second ledger: what
 * a server is given is its own limits, so deleting a server gives its share back.
 *
 * Boxes know nothing of payments. The store makes boxes through {@see self::create()}, an admin does the same by hand. Servers outside a
 * box are not touched by any of this.
 */
class BoxService
{
    public const RESOURCES = ['memory', 'disk', 'cpu', 'allocations', 'backups', 'databases'];

    /** Servers made in a box always have a port of their own, so a share is at least this. */
    public const MINIMUM = ResourcePool::MINIMUM;

    public function __construct(
        private ServerCreationService $creation,
        private ServerDeletionService $deletion,
        private BuildModificationService $build,
        private SuspensionService $suspension,
        private AllocationSelectionService $allocationSelection,
        private FindAssignableAllocationService $findAllocation,
        private SelfServiceEgg $eggs,
    ) {
    }

    // ---- what a box has --------------------------------------------------------------------------------------------------------

    /** @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int, databases: int} */
    public function limits(Box $box): array
    {
        return array_combine(self::RESOURCES, array_map(fn (string $r) => (int) $box->{$r}, self::RESOURCES));
    }

    /** @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int, databases: int} what the servers of the box have been given */
    public function used(Box $box): array
    {
        $servers = Server::query()->where('box_id', $box->id);

        return [
            'memory' => (int) (clone $servers)->sum('memory'),
            'disk' => (int) (clone $servers)->sum('disk'),
            'cpu' => (int) (clone $servers)->sum('cpu'),
            // The ports a server may have are its allocation limit: they are promised to it, whether it takes them or not.
            'allocations' => (int) (clone $servers)->sum('allocation_limit'),
            'backups' => (int) (clone $servers)->sum('backup_limit'),
            'databases' => (int) (clone $servers)->sum('database_limit'),
        ];
    }

    /** @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int, databases: int} */
    public function remaining(Box $box): array
    {
        $limits = $this->limits($box);
        $used = $this->used($box);

        return array_map(fn (string $r) => max(0, $limits[$r] - $used[$r]), array_combine(self::RESOURCES, self::RESOURCES));
    }

    public function canCreateServer(Box $box): bool
    {
        $remaining = $this->remaining($box);
        foreach (['memory', 'disk', 'cpu', 'allocations'] as $resource) {
            if ($remaining[$resource] < self::MINIMUM[$resource]) {
                return false;
            }
        }

        return $box->isUsable();
    }

    /**
     * Refuses what does not fit in what is left of the box.
     *
     * @param  array<string, int>  $asked  what the server is to have in total
     * @param  Server|null  $except  a server that is changed: what it has now is given back before the check
     *
     * @throws DisplayException
     */
    public function check(Box $box, array $asked, ?Server $except = null): void
    {
        $remaining = $this->remaining($box);
        $limits = $this->limits($box);
        $own = $except ? ['memory' => (int) $except->memory, 'disk' => (int) $except->disk, 'cpu' => (int) $except->cpu, 'allocations' => (int) $except->allocation_limit, 'backups' => (int) $except->backup_limit, 'databases' => (int) $except->database_limit] : array_fill_keys(self::RESOURCES, 0);

        foreach (self::RESOURCES as $resource) {
            if (!isset($asked[$resource])) {
                continue;
            }
            if ($asked[$resource] < 0) {
                throw new DisplayException('A share can not be below zero.');
            }
            $available = $remaining[$resource] + $own[$resource];
            if ($asked[$resource] > $available) {
                throw new DisplayException(sprintf(
                    'The box has %s of %s %s left for this, it needs %s.',
                    ResourcePool::format($resource, $available),
                    ResourcePool::format($resource, $limits[$resource]),
                    $resource === 'disk' ? 'disk space' : $resource,
                    ResourcePool::format($resource, $asked[$resource])
                ));
            }
        }
    }

    // ---- making and changing boxes ---------------------------------------------------------------------------------------------

    /**
     * Makes a box for a person. Used by admins and by the store.
     *
     * @param  array<string, mixed>  $data  name, node_id, memory, disk, cpu, allocations, backups, databases, expires_at, notes, source
     */
    public function create(User $user, array $data): Box
    {
        return Box::query()->create([
            'user_id' => $user->id,
            'name' => $data['name'],
            'node_id' => $data['node_id'] ?? null,
            'memory' => (int) $data['memory'],
            'disk' => (int) $data['disk'],
            'cpu' => (int) $data['cpu'],
            'allocations' => max(1, (int) ($data['allocations'] ?? 1)),
            'backups' => max(0, (int) ($data['backups'] ?? 0)),
            'databases' => max(0, (int) ($data['databases'] ?? 0)),
            'status' => Box::ACTIVE,
            'source' => $data['source'] ?? 'admin',
            'expires_at' => $data['expires_at'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * Changes a box. It can not be made smaller than what its servers have been given.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws DisplayException
     */
    public function update(Box $box, array $data): Box
    {
        $used = $this->used($box);
        foreach (self::RESOURCES as $resource) {
            if (isset($data[$resource]) && (int) $data[$resource] < $used[$resource]) {
                throw new DisplayException(sprintf('The servers in this box have been given %s of %s, the box can not have less than that.', ResourcePool::format($resource, $used[$resource]), $resource));
            }
        }
        if (array_key_exists('node_id', $data) && $data['node_id'] !== null && $box->servers()->where('node_id', '!=', $data['node_id'])->exists()) {
            throw new DisplayException('Some servers in this box run on another node, so the box can not be tied to this one.');
        }

        $box->fill(array_intersect_key($data, array_flip(['name', 'node_id', 'memory', 'disk', 'cpu', 'allocations', 'backups', 'databases', 'expires_at', 'notes'])))->save();

        return $box;
    }

    /**
     * Deletes a box. A box with servers in it is only deleted when they are let out of it (they stay, as servers of their own) or deleted
     * with it.
     *
     * @throws DisplayException
     */
    public function delete(Box $box, string $servers = 'refuse'): void
    {
        $inside = $box->servers()->get();
        if ($inside->isNotEmpty()) {
            if ($servers === 'refuse') {
                throw new DisplayException('This box has servers in it. Delete them, or choose what happens to them.');
            }
            foreach ($inside as $server) {
                if ($servers === 'delete') {
                    $this->deletion->withForce(false)->handle($server);
                } else {
                    $server->forceFill(['box_id' => null])->save();
                }
            }
        }

        $box->delete();
    }

    /** Stops the servers of the box and keeps them from starting, because the box was suspended or ran out. */
    public function suspend(Box $box, string $status = Box::SUSPENDED): void
    {
        $box->forceFill(['status' => $status])->save();
        foreach ($box->servers()->get() as $server) {
            $this->tryToggle($server, SuspensionService::ACTION_SUSPEND);
        }
    }

    public function unsuspend(Box $box): void
    {
        $box->forceFill(['status' => Box::ACTIVE])->save();
        foreach ($box->servers()->get() as $server) {
            $this->tryToggle($server, SuspensionService::ACTION_UNSUSPEND);
        }
    }

    private function tryToggle(Server $server, string $action): void
    {
        try {
            $this->suspension->toggle($server, $action);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // ---- servers in a box ------------------------------------------------------------------------------------------------------

    /**
     * The nodes a server in this box can be made on: the node of the box, or any public node that is not in maintenance, with the ports free.
     *
     * @return Collection<int, Node>
     */
    public function nodes(Box $box): Collection
    {
        $query = Node::query()->select('nodes.*')
            ->selectRaw('(SELECT COUNT(*) FROM allocations WHERE allocations.node_id = nodes.id AND allocations.server_id IS NULL) as free_allocations')
            ->where('nodes.maintenance_mode', 0);

        if ($box->node_id) {
            $query->where('nodes.id', $box->node_id);
        } else {
            $query->where('nodes.public', 1);
        }

        return $query->with('location')->get();
    }

    /**
     * Makes a server in a box. It starts from the egg new servers get (the Versions tab puts the software on it afterwards) and has the share
     * of the box that was asked for.
     *
     * @param  array{memory: int, disk: int, cpu: int, allocations: int, backups: int, databases: int}  $share
     *
     * @throws DisplayException
     * @throws \Throwable
     */
    public function createServer(Box $box, string $name, ?string $description, array $share, ?int $nodeId = null): Server
    {
        if (!$box->isUsable()) {
            throw new DisplayException('This box is not active, so nothing can be made in it.');
        }
        foreach (['memory', 'disk', 'cpu', 'allocations'] as $resource) {
            if (($share[$resource] ?? 0) < self::MINIMUM[$resource]) {
                throw new DisplayException('A server needs at least ' . ResourcePool::format($resource, self::MINIMUM[$resource]) . ' of ' . $resource . '.');
            }
        }
        $this->check($box, $share);

        $nodes = $this->nodes($box);
        $placement = [];
        $deployment = null;
        $node = $nodeId ? $nodes->firstWhere('id', $nodeId) : ($box->node_id ? $nodes->first() : null);
        if ($nodeId && !$node) {
            throw new DisplayException('That node can not be used for this box.');
        }
        if ($node) {
            // @phpstan-ignore-next-line property.notFound
            if ((int) $node->free_allocations < 1) {
                throw new DisplayException('The node has no free port for another server.');
            }
            $allocation = $this->allocationSelection->setDedicated(false)->setNodes([$node->id])->setPorts([])->handle();
            $placement = ['node_id' => $node->id, 'allocation_id' => $allocation->id];
        } else {
            $deployment = (new DeploymentObject())->setDedicated(false)->setLocations(config('pterodactyl.self_service.locations') ?? [])->setPorts([]);
        }

        $egg = $this->eggs->resolve(config('pterodactyl.self_service.egg'));
        $environment = [];
        foreach ($egg->variables as $variable) {
            $environment[$variable->env_variable] = $variable->default_value;
        }

        $server = $this->creation->handle(array_merge([
            'external_id' => null,
            'name' => $name,
            'description' => $description,
            'owner_id' => $box->user_id,
            'egg_id' => $egg->id,
            'nest_id' => $egg->nest_id,
            'image' => $this->eggs->newestJavaImage($egg->docker_images ?? []),
            'startup' => $egg->startup,
            'environment' => $environment,
            'memory' => $share['memory'],
            'swap' => 0,
            'disk' => $share['disk'],
            'io' => 500,
            'cpu' => $share['cpu'],
            'threads' => null,
            'skip_scripts' => (bool) (config('pterodactyl.self_service.skip_scripts') ?? preg_match('/^java/i', $egg->name)),
            'oom_disabled' => true,
            'database_limit' => $share['databases'],
            'allocation_limit' => $share['allocations'],
            'backup_limit' => $share['backups'],
            'start_on_completion' => false,
        ], $placement), $deployment);

        $server->forceFill(['box_id' => $box->id])->save();

        // The first port is the one it is played on, the others are taken now so the share is really there.
        for ($i = 1; $i < $share['allocations']; ++$i) {
            try {
                DB::transaction(fn () => $this->findAllocation->handle($server->loadMissing(['node', 'allocation'])));
                $server->unsetRelation('allocations');
            } catch (NoAutoAllocationSpaceAvailableException) {
                break;
            }
        }

        return $server;
    }

    /**
     * Gives a server of the box another share of it.
     *
     * @param  array{memory: int, disk: int, cpu: int, allocations: int, backups: int, databases: int}  $share
     *
     * @throws DisplayException
     */
    public function resizeServer(Box $box, Server $server, array $share): Server
    {
        if ((int) $server->box_id !== $box->id) {
            throw new DisplayException('That server is not in this box.');
        }
        foreach (['memory', 'disk', 'cpu', 'allocations'] as $resource) {
            if ($share[$resource] < self::MINIMUM[$resource]) {
                throw new DisplayException('A server needs at least ' . ResourcePool::format($resource, self::MINIMUM[$resource]) . ' of ' . $resource . '.');
            }
        }
        $taken = Allocation::query()->where('server_id', $server->id)->count();
        if ($share['allocations'] < $taken) {
            throw new DisplayException(sprintf('This server uses %d ports, release some of them before giving it fewer.', $taken));
        }
        $this->check($box, $share, $server);

        return $this->build->handle($server, [
            'oom_disabled' => $server->oom_disabled,
            'swap' => $server->swap,
            'io' => $server->io,
            'threads' => $server->threads,
            'memory' => $share['memory'],
            'disk' => $share['disk'],
            'cpu' => $share['cpu'],
            'database_limit' => $share['databases'],
            'allocation_limit' => $share['allocations'],
            'backup_limit' => $share['backups'],
        ]);
    }
}

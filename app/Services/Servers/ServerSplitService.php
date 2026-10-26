<?php

namespace Pterodactyl\Services\Servers;

use Pterodactyl\Models\Server;
use Illuminate\Support\Collection;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Services\Deployment\AllocationSelectionService;
use Pterodactyl\Exceptions\Service\Deployment\NoViableAllocationException;

/**
 * Splitting a server: the memory, disk and CPU of one server is shared by it and the servers split off it (its parts). The sum of
 * the parts never changes, so there is no second ledger: the total is whatever the parts add up to, and the first server (the root)
 * keeps what the others do not have. Moving resources between the parts is changing how that sum is divided, deleting a part gives its
 * share back to the root.
 *
 * Every part is a server of its own, on the node of the root, with its own port, files, console and power. Parts are not split again.
 */
class ServerSplitService
{
    public const RESOURCES = ['memory', 'disk', 'cpu'];

    /** The most parts that can be split off one server. */
    public const MAX_CHILDREN = 8;

    public function __construct(
        private ServerCreationService $creationService,
        private BuildModificationService $buildService,
        private AllocationSelectionService $allocations,
        private ResourcePool $pools,
        private SelfServiceEgg $eggs,
    ) {
    }

    /** The server the parts are split off: the server itself, or the one it was split from. */
    public function root(Server $server): Server
    {
        return $server->parent_server_id ? ($server->parent ?? $server) : $server;
    }

    /** @return Collection<int, Server> the root first, then the parts in the order they were made */
    public function family(Server $root): Collection
    {
        return collect([$root])->concat($root->children()->get());
    }

    /** @return array{memory: int, disk: int, cpu: int} what all the parts share */
    public function total(Server $root): array
    {
        $family = $this->family($root);

        return array_combine(self::RESOURCES, array_map(fn (string $r) => (int) $family->sum($r), self::RESOURCES));
    }

    /** Whether the root has fixed limits, which is what makes a share of them possible (0 means no limit). */
    public function splittable(Server $root): bool
    {
        if ($root->parent_server_id) {
            return false;
        }
        foreach (self::RESOURCES as $resource) {
            if ((int) $root->{$resource} <= 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Splits a new server off the root, with the given share of it.
     *
     * @param  array{memory: int, disk: int, cpu: int}  $share
     *
     * @throws DisplayException
     * @throws \Throwable
     */
    public function split(Server $root, string $name, array $share): Server
    {
        if ($root->parent_server_id) {
            throw new DisplayException('A server that was split off another one can not be split again.');
        }
        if (!$this->splittable($root)) {
            throw new DisplayException('Only a server with a limit on memory, disk and CPU can be split, this one has no limit on one of them.');
        }
        if ($root->children()->count() >= self::MAX_CHILDREN) {
            throw new DisplayException('A server can be split into at most ' . (self::MAX_CHILDREN + 1) . ' parts.');
        }

        foreach (self::RESOURCES as $resource) {
            if ($share[$resource] < ResourcePool::MINIMUM[$resource]) {
                throw new DisplayException('A part needs at least ' . ResourcePool::format($resource, ResourcePool::MINIMUM[$resource]) . ' of ' . $resource . '.');
            }
            if ($root->{$resource} - $share[$resource] < ResourcePool::MINIMUM[$resource]) {
                throw new DisplayException('That leaves ' . $root->name . ' with too little ' . $resource . ', it needs at least ' . ResourcePool::format($resource, ResourcePool::MINIMUM[$resource]) . '.');
            }
        }

        // The part needs a port of its own; a person with a resource pool pays for it from the allocations of the pool.
        $owner = $root->user;
        if ($owner && $this->pools->appliesTo($owner)) {
            $this->pools->check($owner, ['allocations' => 1]);
        }
        try {
            $allocation = $this->allocations->setDedicated(false)->setNodes([$root->node_id])->setPorts([])->handle();
        } catch (NoViableAllocationException) {
            throw new DisplayException('The node has no free port for another part.');
        }

        // A part starts from the egg the creation wizard uses, not the one of the server it is split off: the software is chosen when it is made
        // and installed on it afterwards, the same way.
        $config = config('pterodactyl.self_service');
        $egg = $this->eggs->resolve($config['egg'] ?? null);
        $environment = [];
        foreach ($egg->variables as $variable) {
            $environment[$variable->env_variable] = $variable->default_value;
        }

        $child = $this->creationService->handle([
            'external_id' => null,
            'name' => $name,
            'description' => '',
            'owner_id' => $root->owner_id,
            'node_id' => $root->node_id,
            'allocation_id' => $allocation->id,
            'egg_id' => $egg->id,
            'nest_id' => $egg->nest_id,
            'image' => $this->eggs->newestJavaImage($egg->docker_images ?? []),
            'startup' => $egg->startup,
            'environment' => $environment,
            'memory' => $share['memory'],
            'swap' => 0,
            'disk' => $share['disk'],
            'io' => $root->io,
            'cpu' => $share['cpu'],
            'threads' => null,
            // A plain Java egg has nothing to install, the software is put in place by the Versions tab.
            'skip_scripts' => (bool) ($config['skip_scripts'] ?? preg_match('/^java/i', $egg->name)),
            'oom_disabled' => (bool) $root->oom_disabled,
            'database_limit' => 0,
            'allocation_limit' => 1,
            'backup_limit' => 0,
            'start_on_completion' => false,
        ]);
        $child->forceFill(['parent_server_id' => $root->id])->save();

        $this->apply($root, [
            'memory' => $root->memory - $share['memory'],
            'disk' => $root->disk - $share['disk'],
            'cpu' => $root->cpu - $share['cpu'],
        ]);

        return $child;
    }

    /**
     * Divides the total in another way. Every part is in the list, and the shares add up to the total.
     *
     * @param  array<string, array{memory: int, disk: int, cpu: int}>  $shares  by the short uuid of each part
     *
     * @throws DisplayException
     */
    public function divide(Server $root, array $shares): void
    {
        $family = $this->family($root)->keyBy('uuidShort');
        if (count($shares) !== $family->count() || array_diff($family->keys()->all(), array_keys($shares))) {
            throw new DisplayException('Every part has to be in the list, and only the parts of this server.');
        }

        $total = $this->total($root);
        foreach (self::RESOURCES as $resource) {
            $sum = 0;
            foreach ($shares as $share) {
                if ($share[$resource] < ResourcePool::MINIMUM[$resource]) {
                    throw new DisplayException('A part needs at least ' . ResourcePool::format($resource, ResourcePool::MINIMUM[$resource]) . ' of ' . $resource . '.');
                }
                $sum += $share[$resource];
            }
            if ($sum !== $total[$resource]) {
                throw new DisplayException('The parts have ' . ResourcePool::format($resource, $sum) . ' of ' . $resource . ' together but there is ' . ResourcePool::format($resource, $total[$resource]) . ' to share.');
            }
        }

        // What shrinks goes first, so the node never has more promised than it did before.
        $order = $family->sortBy(fn (Server $s) => $shares[$s->uuidShort]['memory'] - $s->memory);
        foreach ($order as $server) {
            $share = $shares[$server->uuidShort];
            if ($share['memory'] !== (int) $server->memory || $share['disk'] !== (int) $server->disk || $share['cpu'] !== (int) $server->cpu) {
                $this->apply($server, $share);
            }
        }
    }

    /** A part is going away: the root gets its share. Called while the server is deleted. */
    public function giveBack(Server $child): void
    {
        $root = $child->parent;
        if (!$root) {
            return;
        }

        $this->apply($root, [
            'memory' => $root->memory + $child->memory,
            'disk' => $root->disk + $child->disk,
            'cpu' => $root->cpu + $child->cpu,
        ]);
    }

    /**
     * Sets the memory, disk and CPU of a server and tells Wings, keeping everything else of its build as it is.
     *
     * @param  array{memory: int, disk: int, cpu: int}  $share
     */
    private function apply(Server $server, array $share): void
    {
        $this->buildService->handle($server, array_merge([
            'oom_disabled' => $server->oom_disabled,
            'swap' => $server->swap,
            'io' => $server->io,
            'threads' => $server->threads,
            'database_limit' => $server->database_limit,
            'allocation_limit' => $server->allocation_limit,
            'backup_limit' => $server->backup_limit,
        ], $share));
    }
}

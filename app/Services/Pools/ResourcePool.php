<?php

namespace Pterodactyl\Services\Pools;

use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Exceptions\DisplayException;

/**
 * Resource pools: what a person may spend on the servers they own, as a total of memory (MB), disk (MB), CPU (percent) and allocations, instead
 * of a number of servers. A person has the pool they were given (columns pool_* of the user) or, without one, the defaults of the panel
 * (config pterodactyl.pools). Everything that is spent is counted from the servers the person owns, there is no second ledger to go out
 * of step: deleting a server gives its share back.
 *
 * Whoever may create servers in the admin area is not limited by a pool.
 */
class ResourcePool
{
    public const RESOURCES = ['memory', 'disk', 'cpu', 'allocations', 'backups'];

    /** The least a server can be made with, in the units of the pool. A pool with less left than this can not make another one. */
    public const MINIMUM = ['memory' => 512, 'disk' => 1024, 'cpu' => 50, 'allocations' => 1, 'backups' => 0];

    private const LABELS = ['memory' => 'memory', 'disk' => 'disk space', 'cpu' => 'CPU', 'allocations' => 'allocations', 'backups' => 'backups'];

    public function enabled(): bool
    {
        return (bool) config('pterodactyl.pools.enabled');
    }

    /** Whether the pool decides what this person may make: pools are on and the person is not an admin who may create servers. */
    public function appliesTo(User $user): bool
    {
        return $this->enabled() && !$user->hasPermission('servers.create');
    }

    /** @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int} what a person gets who has no pool of their own */
    public function defaults(): array
    {
        return [
            'memory' => max(0, (int) config('pterodactyl.pools.memory')),
            'disk' => max(0, (int) config('pterodactyl.pools.disk')),
            'cpu' => max(0, (int) config('pterodactyl.pools.cpu')),
            'allocations' => max(0, (int) config('pterodactyl.pools.allocations')),
            'backups' => max(0, (int) config('pterodactyl.pools.backups')),
        ];
    }

    /** @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int} the pool of this person: theirs, or the defaults for what is not set */
    public function limits(User $user): array
    {
        $limits = $this->defaults();
        foreach (self::RESOURCES as $resource) {
            $own = $user->getAttribute('pool_' . $resource);
            if ($own !== null) {
                $limits[$resource] = (int) $own;
            }
        }

        return $limits;
    }

    /** @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int} what the servers of this person use now */
    public function used(User $user): array
    {
        $servers = Server::query()->where('owner_id', $user->id);

        return [
            'memory' => (int) (clone $servers)->sum('memory'),
            'disk' => (int) (clone $servers)->sum('disk'),
            'cpu' => (int) (clone $servers)->sum('cpu'),
            'allocations' => Allocation::query()->whereIn('server_id', (clone $servers)->select('id'))->count(),
            // What the servers may keep, their backup limits added up (a server without a limit counts as none).
            'backups' => (int) (clone $servers)->sum('backup_limit'),
        ];
    }

    /** @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int} what is left, never below zero */
    public function remaining(User $user): array
    {
        $limits = $this->limits($user);
        $used = $this->used($user);

        return array_map(fn (string $resource) => max(0, $limits[$resource] - $used[$resource]), array_combine(self::RESOURCES, self::RESOURCES));
    }

    /** Whether another server can be made at all with what is left. */
    public function canCreate(User $user): bool
    {
        $remaining = $this->remaining($user);
        foreach (self::MINIMUM as $resource => $least) {
            if ($remaining[$resource] < $least) {
                return false;
            }
        }

        return true;
    }

    /**
     * What a person can be given when they ask for nothing in particular: the usual size of a server, cut down to what is left.
     *
     * @param  array{memory: int, disk: int, cpu: int, allocations: int, backups: int}  $wanted
     * @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int}
     */
    public function fit(User $user, array $wanted): array
    {
        $remaining = $this->remaining($user);

        return array_map(fn (string $resource) => min($wanted[$resource], $remaining[$resource]), array_combine(self::RESOURCES, self::RESOURCES));
    }

    /**
     * Refuses what does not fit in what is left, saying which part does not.
     *
     * @param  array{memory?: int, disk?: int, cpu?: int, allocations?: int, backups?: int}  $asked
     *
     * @throws DisplayException
     */
    public function check(User $user, array $asked): void
    {
        $remaining = $this->remaining($user);
        $limits = $this->limits($user);

        foreach (self::RESOURCES as $resource) {
            if (isset($asked[$resource]) && $asked[$resource] > $remaining[$resource]) {
                throw new DisplayException(sprintf(
                    'Your resource pool has %s of %s %s left, this needs %s.',
                    self::format($resource, $remaining[$resource]),
                    self::format($resource, $limits[$resource]),
                    self::LABELS[$resource],
                    self::format($resource, $asked[$resource])
                ));
            }
        }
    }

    /** A number of a pool as it is said to people. */
    public static function format(string $resource, int $value): string
    {
        return match ($resource) {
            'memory', 'disk' => $value >= 1024 ? rtrim(rtrim(number_format($value / 1024, 1), '0'), '.') . ' GB' : $value . ' MB',
            'cpu' => $value . '%',
            default => (string) $value,
        };
    }
}

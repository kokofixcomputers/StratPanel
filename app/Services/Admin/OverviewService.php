<?php

namespace Pterodactyl\Services\Admin;

use Illuminate\Support\Collection;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Models\User;

/**
 * Everything the admin overview shows. Each method is a handful of plain queries, nothing here talks to a node, so the page
 * opens as fast as the database answers.
 */
class OverviewService
{
    /**
     * The numbers on the cards at the top: totals, with a line of detail for each.
     *
     * @return array<string, array<string, int>>
     */
    public function totals(): array
    {
        $byStatus = Server::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return [
            'servers' => [
                'total' => (int) $byStatus->sum(),
                'installing' => (int) ($byStatus[Server::STATUS_INSTALLING] ?? 0),
                'suspended' => (int) ($byStatus[Server::STATUS_SUSPENDED] ?? 0),
                'failed' => (int) (($byStatus[Server::STATUS_INSTALL_FAILED] ?? 0) + ($byStatus[Server::STATUS_REINSTALL_FAILED] ?? 0)),
            ],
            'users' => [
                'total' => User::query()->count(),
                'admins' => User::query()->where('root_admin', true)->count(),
                'two_factor' => User::query()->where('use_totp', true)->count(),
                'new' => User::query()->where('created_at', '>=', now()->subDays(7))->count(),
            ],
            'nodes' => [
                'total' => Node::query()->count(),
                'maintenance' => Node::query()->where('maintenance_mode', true)->count(),
            ],
            'domains' => [
                'total' => ServerDomain::query()->count(),
            ],
        ];
    }

    /**
     * One row for every node with what is promised to servers on it against what it has. Memory and disk are in MiB. The limit
     * includes the overallocation of the node, a node that does not check it (a negative value) counts only what it has.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function nodes(): Collection
    {
        $promised = Server::query()
            ->selectRaw('node_id, COUNT(*) as servers, SUM(memory) as memory, SUM(disk) as disk')
            ->groupBy('node_id')
            ->get()
            ->keyBy('node_id');
        $allocations = Allocation::query()
            ->selectRaw('node_id, COUNT(*) as total, SUM(CASE WHEN server_id IS NULL THEN 0 ELSE 1 END) as assigned')
            ->groupBy('node_id')
            ->get()
            ->keyBy('node_id');

        return Node::query()->with('location')->orderBy('name')->get()->map(function (Node $node) use ($promised, $allocations): array {
            $used = $promised->get($node->id);
            $ports = $allocations->get($node->id);

            return [
                'node' => $node,
                'servers' => (int) ($used->servers ?? 0),
                'memory' => $this->usage((int) ($used->memory ?? 0), $this->limit($node->memory, $node->memory_overallocate)),
                'disk' => $this->usage((int) ($used->disk ?? 0), $this->limit($node->disk, $node->disk_overallocate)),
                'allocations' => $this->usage((int) ($ports->assigned ?? 0), (int) ($ports->total ?? 0)),
            ];
        });
    }

    /**
     * The same, added up over every node, for the capacity box.
     *
     * @param  Collection<int, array<string, mixed>>  $nodes
     * @return array<string, array<string, mixed>>
     */
    public function capacity(Collection $nodes): array
    {
        $sum = fn (string $key, string $field): int => (int) $nodes->sum(fn (array $row) => $row[$key][$field]);

        return [
            'memory' => $this->usage($sum('memory', 'used'), $sum('memory', 'limit')),
            'disk' => $this->usage($sum('disk', 'used'), $sum('disk', 'limit')),
            'allocations' => $this->usage($sum('allocations', 'used'), $sum('allocations', 'limit')),
        ];
    }

    /**
     * The eggs that have servers, most used first.
     *
     * @return Collection<int, Egg>
     */
    public function eggs(int $limit = 6): Collection
    {
        return Egg::query()
            ->withCount('servers')
            ->orderByDesc('servers_count')
            ->limit($limit)
            ->get()
            ->filter(fn (Egg $egg) => $egg->servers_count > 0)
            ->values();
    }

    /** @return Collection<int, Server> */
    public function recentServers(int $limit = 5): Collection
    {
        return Server::query()->with(['user', 'node'])->orderByDesc('created_at')->limit($limit)->get();
    }

    /** @return Collection<int, User> */
    public function recentUsers(int $limit = 5): Collection
    {
        return User::query()->orderByDesc('created_at')->limit($limit)->get();
    }

    /** @return Collection<int, ActivityLog> */
    public function recentActivity(int $limit = 8): Collection
    {
        return ActivityLog::query()->with('actor')->orderByDesc('timestamp')->limit($limit)->get();
    }

    /** What a node can hold of a resource: what it has, with its overallocation added when it has one. */
    private function limit(int $total, int $overallocate): int
    {
        return $overallocate > 0 ? (int) round($total * (1 + $overallocate / 100)) : $total;
    }

    /**
     * @return array{used: int, limit: int, percent: float, level: string}
     */
    private function usage(int $used, int $limit): array
    {
        $percent = $limit > 0 ? round($used / $limit * 100, 1) : 0.0;

        return [
            'used' => $used,
            'limit' => $limit,
            'percent' => $percent,
            // The colour of the bar: plenty of room, getting full, or over.
            'level' => $percent > 90 ? 'danger' : ($percent > 70 ? 'warning' : 'ok'),
        ];
    }
}

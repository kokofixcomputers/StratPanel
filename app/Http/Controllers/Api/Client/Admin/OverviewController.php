<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Admin\OverviewService;
use Pterodactyl\Services\Helpers\SoftwareVersionService;

/** The numbers of the first page of the admin area. */
class OverviewController extends Controller
{
    public function __construct(private OverviewService $overview, private SoftwareVersionService $version)
    {
    }

    public function __invoke(): JsonResponse
    {
        $nodes = $this->overview->nodes();

        return new JsonResponse([
            'totals' => $this->overview->totals(),
            'capacity' => $this->overview->capacity($nodes),
            'nodes' => $nodes->map(fn (array $row) => [
                'id' => $row['node']->id,
                'name' => $row['node']->name,
                'fqdn' => $row['node']->fqdn,
                'location' => $row['node']->location->short ?? null,
                'maintenance' => (bool) $row['node']->maintenance_mode,
                'servers' => $row['servers'],
                'memory' => $row['memory'],
                'disk' => $row['disk'],
                'allocations' => $row['allocations'],
            ])->values()->all(),
            'eggs' => $this->overview->eggs()->map(fn ($egg) => [
                'id' => $egg->id,
                'name' => $egg->name,
                'servers' => (int) $egg->servers_count,
            ])->values()->all(),
            'recent_servers' => $this->overview->recentServers()->map(fn ($server) => [
                'id' => $server->id,
                'name' => $server->name,
                'owner' => $server->user->username ?? null,
                'node' => $server->node->name ?? null,
                'created_at' => $server->created_at->toIso8601String(),
            ])->values()->all(),
            'recent_users' => $this->overview->recentUsers()->map(fn ($user) => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'root_admin' => (bool) $user->root_admin,
                'created_at' => $user->created_at->toIso8601String(),
            ])->values()->all(),
            'links' => ['discord' => $this->version->getDiscord(), 'donations' => $this->version->getDonations()],
            'activity' => $this->overview->recentActivity()->map(fn ($log) => [
                'event' => $log->event,
                'actor' => $log->actor->username ?? null,
                'ip' => $log->ip,
                'timestamp' => $log->timestamp->toIso8601String(),
            ])->values()->all(),
        ]);
    }
}

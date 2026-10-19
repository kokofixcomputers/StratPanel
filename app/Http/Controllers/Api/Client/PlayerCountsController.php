<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Services\Minecraft\ServerListPing;

/**
 * How many players are on the servers of the dashboard, by asking each one for its server list status. Only servers the person can
 * reach are asked, and the answers are kept for a few seconds so a busy dashboard does not ask a server again and again.
 */
class PlayerCountsController extends ClientApiController
{
    public const CACHE_SECONDS = 15;

    public const MAX_SERVERS = 100;

    public function index(Request $request): array
    {
        $user = $request->user();
        $this->validate($request, ['servers' => ['required', 'string', 'max:5000']]);

        $uuids = array_slice(array_values(array_unique(array_filter(explode(',', (string) $request->input('servers')), fn ($u) => preg_match('/^[0-9a-f-]{36}$/i', $u)))), 0, self::MAX_SERVERS);
        if (!$uuids) {
            return ['object' => 'player_counts', 'attributes' => []];
        }

        $query = $user->canAccessAllServers()
            ? Server::query()->whereIn('servers.uuid', $uuids)
            : $user->accessibleServers()->whereIn('servers.uuid', $uuids);
        // Servers that are not ready to be played on are not asked.
        $servers = $query->with(['allocation', 'node'])->whereNull('servers.status')->get();

        $answers = [];
        $toAsk = [];
        foreach ($servers as $server) {
            $cached = Cache::get($this->key($server->uuid));
            if ($cached !== null) {
                $answers[$server->uuid] = $cached ?: null;
                continue;
            }
            $target = $this->target($server);
            if ($target) {
                $toAsk[$server->uuid] = $target;
            }
        }

        foreach (ServerListPing::query($toAsk) as $uuid => $result) {
            // A server that did not answer is remembered too (as false), for the same few seconds.
            Cache::put($this->key($uuid), $result ?: false, self::CACHE_SECONDS);
            $answers[$uuid] = $result;
        }

        return [
            'object' => 'player_counts',
            'attributes' => array_filter(array_map(fn ($a) => $a ? ['online' => $a['online'], 'max' => $a['max']] : null, $answers)),
        ];
    }

    private function key(string $uuid): string
    {
        return 'slp:' . $uuid;
    }

    /** Where the game is: the address people join with, or the node when that is "all addresses". */
    private function target(Server $server): ?array
    {
        $allocation = $server->allocation;
        if (!$allocation) {
            return null;
        }
        $host = $allocation->ip_alias ?: $allocation->ip;
        if (in_array($host, ['0.0.0.0', '::', ''], true)) {
            $host = $server->node->fqdn;
        }

        return [$host, (int) $allocation->port];
    }
}

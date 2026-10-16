<?php

namespace Pterodactyl\Services\Nodes;

use Pterodactyl\Models\Node;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Repositories\Wings\DaemonSelfUpdateRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * Brings the Wings of nodes up to the newest build of Stratosphere.
 */
class NodeUpdateService
{
    public function __construct(private DaemonSelfUpdateRepository $repository)
    {
    }

    /** The version of the newest build, null when it can not be found out. */
    public function latest(): ?string
    {
        return Cache::remember('wings:latest', now()->addMinutes(10), function () {
            try {
                $response = Http::timeout(5)->get(rtrim(config('updates.wings_url'), '/') . '/version.txt');
            } catch (\Throwable) {
                return null;
            }
            $version = trim($response->body());

            return $response->successful() && $version !== '' && strlen($version) < 100 ? $version : null;
        }) ?: null;
    }

    /** Whether a node runs something else than the newest build. A node whose version is not known counts as not outdated. */
    public function outdated(?string $version): bool
    {
        $latest = $this->latest();

        return $latest !== null && $version !== null && $version !== '' && ltrim($version, 'v') !== $latest;
    }

    /**
     * Updates one node. It never throws: what happened comes back as text, so a list of nodes goes on after a node that fails.
     *
     * @return array{node: int, name: string, status: 'updated'|'current'|'failed', message: string, from?: string, to?: string}
     */
    public function update(Node $node): array
    {
        $out = ['node' => $node->id, 'name' => $node->name];

        try {
            $result = $this->repository->setNode($node)->update();
        } catch (DaemonConnectionException) {
            return $out + ['status' => 'failed', 'message' => 'The node could not be reached.'];
        }

        if (!empty($result['unsupported'])) {
            return $out + ['status' => 'failed', 'message' => 'This Wings is too old to update itself (or is not the Wings of Stratosphere). Replace its binary once by hand with the newest build, see docs/updates.md.'];
        }
        if (!empty($result['error'])) {
            return $out + ['status' => 'failed', 'message' => $result['error']];
        }

        $to = $result['to'] ?? '';
        if (empty($result['updated'])) {
            return $out + ['status' => 'current', 'message' => 'Already on ' . $to . '.', 'to' => $to];
        }

        return $out + ['status' => 'updated', 'message' => 'Updated to ' . $to . ', restarting.', 'from' => $result['from'] ?? '', 'to' => $to];
    }

    /**
     * Updates every node.
     *
     * @param  iterable<Node>  $nodes
     * @return array<int, array<string, mixed>>
     */
    public function updateAll(iterable $nodes): array
    {
        $results = [];
        foreach ($nodes as $node) {
            $results[] = $this->update($node);
        }

        return $results;
    }
}

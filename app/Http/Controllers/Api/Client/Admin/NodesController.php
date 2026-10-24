<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\ApiKey;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Contracts\Encryption\Encrypter;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Nodes\WingsUpdateService;
use Pterodactyl\Services\Api\KeyCreationService;
use Pterodactyl\Services\Nodes\NodeCreationService;
use Pterodactyl\Services\Nodes\NodeDeletionService;
use Pterodactyl\Services\Nodes\NodeUpdateService;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Repositories\Eloquent\NodeRepository;
use Pterodactyl\Http\Requests\Admin\Node\NodeFormRequest;
use Pterodactyl\Repositories\Wings\DaemonConfigurationRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Http\Controllers\Api\Client\Admin\Concerns\FormatsAdminResponses;

/** Nodes for the admin pages: the list, one node and its settings, how to set Wings up on it, and updating Wings. */
class NodesController extends Controller
{
    use FormatsAdminResponses;

    public function __construct(
        private NodeCreationService $creation,
        private NodeUpdateService $update,
        private NodeDeletionService $deletion,
        private NodeRepository $repository,
        private WingsUpdateService $wings,
        private DaemonConfigurationRepository $daemon,
        private KeyCreationService $keys,
        private Encrypter $encrypter,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $nodes = Node::query()->with('location')->withCount('servers')
            ->when($search !== '', fn ($query) => $query->where('name', 'like', '%' . $search . '%'))
            ->orderBy('id')->paginate(25);

        return new JsonResponse([
            'nodes' => $nodes->getCollection()->map(fn (Node $node) => [
                'id' => $node->id,
                'name' => $node->name,
                'location' => $node->location->short,
                'memory' => $node->memory,
                'disk' => $node->disk,
                'servers' => (int) $node->servers_count,
                'secure' => $node->scheme === 'https',
                'public' => (bool) $node->public,
                'maintenance' => (bool) $node->maintenance_mode,
            ])->values()->all(),
            'pagination' => $this->pagination($nodes),
            // Only to those who may update, they are the ones who see whether a node is behind.
            'wings_latest' => $request->user()->hasPermission('nodes.software') ? $this->wings->latest() : null,
        ]);
    }

    /** What the forms of a node need: the locations to choose from. */
    public function form(Request $request): JsonResponse
    {
        return new JsonResponse([
            'locations' => Location::query()->orderBy('short')->get(['id', 'short', 'long'])->map(fn (Location $location) => ['id' => $location->id, 'short' => $location->short, 'long' => $location->long])->all(),
            'secure' => $request->isSecure(),
        ]);
    }

    public function view(Request $request, int $node): JsonResponse
    {
        return new JsonResponse($this->details($request, Node::query()->with('location')->withCount('servers')->findOrFail($node)));
    }

    /** @throws \Throwable */
    public function store(NodeFormRequest $request): JsonResponse
    {
        $node = $this->creation->handle($request->normalize());

        return new JsonResponse($this->details($request, $node->load('location')->loadCount('servers')), 201);
    }

    /** @throws \Throwable */
    public function updateNode(NodeFormRequest $request, int $node): JsonResponse
    {
        $found = Node::query()->findOrFail($node);
        $this->update->handle($found, $request->normalize(), $request->boolean('reset_secret'));

        return new JsonResponse($this->details($request, $found->refresh()->load('location')->loadCount('servers')));
    }

    public function destroy(int $node): JsonResponse
    {
        $this->deletion->handle($node);

        return new JsonResponse([], 204);
    }

    /** What Wings on the node says about itself. An unreachable node is an answer too, not an error. */
    public function systemInformation(int $node): JsonResponse
    {
        try {
            $data = $this->daemon->setNode(Node::query()->findOrFail($node))->getSystemInformation();
        } catch (DaemonConnectionException $exception) {
            return new JsonResponse(['online' => false, 'error' => $exception->getMessage()]);
        }

        return new JsonResponse([
            'online' => true,
            'version' => $data['version'] ?? '',
            'system' => [
                'type' => Str::title($data['os'] ?? 'Unknown'),
                'arch' => $data['architecture'] ?? '--',
                'release' => $data['kernel_version'] ?? '--',
                'cpus' => (int) ($data['cpu_count'] ?? 0),
            ],
        ]);
    }

    /** The file Wings is set up with, and what the "auto deploy" command needs. */
    public function configuration(int $node): JsonResponse
    {
        return new JsonResponse([
            'yaml' => Node::query()->findOrFail($node)->getYamlConfiguration(),
            'panel_url' => config('app.url'),
            'insecure' => (bool) config('app.debug'),
        ]);
    }

    /** A key (made once, then used again) that lets a new machine fetch its own configuration. */
    public function token(Request $request, int $node): JsonResponse
    {
        $found = Node::query()->findOrFail($node);
        $key = ApiKey::query()
            ->where('user_id', $request->user()->id)
            ->where('key_type', ApiKey::TYPE_APPLICATION)
            ->where('r_nodes', 3)
            ->first();

        // No key of this person with read and write on nodes yet: make it now.
        if (!$key) {
            $key = $this->keys->setKeyType(ApiKey::TYPE_APPLICATION)->handle([
                'user_id' => $request->user()->id,
                'memo' => 'Automatically generated node deployment key.',
                'allowed_ips' => [],
            ], ['r_nodes' => 3]);
        }

        return new JsonResponse(['node' => $found->id, 'token' => $key->identifier . $this->encrypter->decrypt($key->token)]);
    }

    /** Updates Wings on one node. */
    public function updateWings(int $node): JsonResponse
    {
        $result = $this->wings->update(Node::query()->findOrFail($node));

        return new JsonResponse($result['status'] === 'failed' ? $result + ['error' => $result['message']] : $result, $result['status'] === 'failed' ? 502 : 200);
    }

    /** Updates Wings on every node. */
    public function updateAllWings(): JsonResponse
    {
        return new JsonResponse(['results' => $this->wings->updateAll(Node::query()->orderBy('id')->get())]);
    }

    /** @return array<string, mixed> */
    private function details(Request $request, Node $node): array
    {
        $stats = $this->repository->getUsageStatsRaw($node);
        $level = fn (float $percent) => $percent <= 70 ? 'ok' : ($percent > 90 ? 'danger' : 'warning');
        $usage = fn (string $key) => [
            'value' => (int) $stats[$key]['value'],
            'max' => (int) $stats[$key]['max'],
            'percent' => $stats[$key]['max'] > 0 ? round(($stats[$key]['value'] / $stats[$key]['max']) * 100, 1) : 0,
            'level' => $level($stats[$key]['max'] > 0 ? ($stats[$key]['value'] / $stats[$key]['max']) * 100 : 0),
        ];

        return [
            'id' => $node->id,
            'uuid' => $node->uuid,
            'name' => $node->name,
            'description' => $node->description,
            'location' => ['id' => $node->location->id, 'short' => $node->location->short, 'long' => $node->location->long],
            'location_id' => $node->location_id,
            'public' => (bool) $node->public,
            'fqdn' => $node->fqdn,
            'scheme' => $node->scheme,
            'behind_proxy' => (bool) $node->behind_proxy,
            'maintenance_mode' => (bool) $node->maintenance_mode,
            'cpu_burst_enabled' => (bool) $node->cpu_burst_enabled,
            'cpu_burst_percent' => (int) $node->cpu_burst_percent,
            'memory' => $node->memory,
            'memory_overallocate' => (int) $node->memory_overallocate,
            'disk' => $node->disk,
            'disk_overallocate' => (int) $node->disk_overallocate,
            'upload_size' => (int) $node->upload_size,
            'daemonListen' => $node->daemonListen,
            'daemonSFTP' => $node->daemonSFTP,
            'daemonBase' => $node->daemonBase,
            'servers' => (int) $node->servers_count,
            'usage' => ['memory' => $usage('memory'), 'disk' => $usage('disk')],
            'wings_latest' => $request->user()->hasPermission('nodes.software') ? $this->wings->latest() : null,
        ];
    }
}

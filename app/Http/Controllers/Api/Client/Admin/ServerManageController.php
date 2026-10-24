<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Location;
use Pterodactyl\Enum\JwtScope;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\ServerTransfer;
use Illuminate\Database\ConnectionInterface;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Nodes\NodeJWTService;
use Pterodactyl\Services\Servers\SuspensionService;
use Pterodactyl\Services\Servers\ReinstallServerService;
use Pterodactyl\Repositories\Eloquent\NodeRepository;
use Pterodactyl\Repositories\Wings\DaemonTransferRepository;
use Pterodactyl\Contracts\Repository\ServerRepositoryInterface;
use Pterodactyl\Contracts\Repository\AllocationRepositoryInterface;

/** Reinstalling, suspending, the install status and transferring a server, for the admin pages. */
class ServerManageController extends Controller
{
    public function __construct(
        private ReinstallServerService $reinstall,
        private SuspensionService $suspension,
        private ServerRepositoryInterface $servers,
        private AllocationRepositoryInterface $allocations,
        private ConnectionInterface $connection,
        private DaemonTransferRepository $daemonTransfer,
        private NodeJWTService $jwt,
        private NodeRepository $nodes,
    ) {
    }

    public function view(int $serverId): JsonResponse
    {
        return new JsonResponse($this->state(Server::query()->with('transfer')->findOrFail($serverId)));
    }

    public function reinstall(int $serverId): JsonResponse
    {
        $this->reinstall->handle(Server::query()->findOrFail($serverId));

        return new JsonResponse($this->state(Server::query()->with('transfer')->findOrFail($serverId)));
    }

    public function toggleInstall(int $serverId): JsonResponse
    {
        $server = Server::query()->findOrFail($serverId);
        if ($server->status === Server::STATUS_INSTALL_FAILED) {
            throw new DisplayException(trans('admin/server.exceptions.marked_as_failed'));
        }

        $this->servers->update($server->id, ['status' => $server->isInstalled() ? Server::STATUS_INSTALLING : null], true, true);

        return new JsonResponse($this->state(Server::query()->with('transfer')->findOrFail($serverId)));
    }

    public function suspension(Request $request, int $serverId): JsonResponse
    {
        $data = $request->validate(['action' => 'required|in:suspend,unsuspend']);
        $this->suspension->toggle(Server::query()->findOrFail($serverId), $data['action']);

        return new JsonResponse($this->state(Server::query()->with('transfer')->findOrFail($serverId)));
    }

    /** @throws \Throwable */
    public function transfer(Request $request, int $serverId): JsonResponse
    {
        $server = Server::query()->with('allocations')->findOrFail($serverId);
        $validated = $request->validate([
            'node_id' => 'required|exists:nodes,id',
            'allocation_id' => 'required|bail|unique:servers|exists:allocations,id',
            'allocation_additional' => 'nullable|array',
        ]);

        $nodeId = (int) $validated['node_id'];
        $allocationId = (int) $validated['allocation_id'];
        $additional = array_map('intval', $validated['allocation_additional'] ?? []);

        // Check if the node is viable for the transfer.
        $node = $this->nodes->getNodeWithResourceUsage($nodeId);
        if (!$node->isViable($server->memory, $server->disk)) {
            throw new DisplayException(trans('admin/server.alerts.transfer_not_viable'));
        }

        $server->validateTransferState();

        $this->connection->transaction(function () use ($server, $nodeId, $allocationId, $additional) {
            // Create a new ServerTransfer entry.
            $transfer = new ServerTransfer();
            $transfer->server_id = $server->id;
            $transfer->old_node = $server->node_id;
            $transfer->new_node = $nodeId;
            $transfer->old_allocation = $server->allocation_id;
            $transfer->new_allocation = $allocationId;
            $transfer->old_additional_allocations = $server->allocations->where('id', '!=', $server->allocation_id)->pluck('id')->values()->toArray();
            $transfer->new_additional_allocations = $additional;
            $transfer->save();

            // Add the allocations to the server, so they cannot be automatically assigned while the transfer is in progress.
            $this->assignAllocationsToServer($server, $nodeId, $allocationId, $additional);

            // Generate a token for the destination node that the source node can use to authenticate with.
            $token = $this->jwt
                ->setExpiresAt(CarbonImmutable::now()->addMinutes(15))
                ->setSubject($server->uuid)
                ->setScopes(JwtScope::ServerTransfer)
                ->handle($transfer->newNode, $server->uuid);

            // Notify the source node of the pending outgoing transfer.
            $this->daemonTransfer->setServer($server)->notify($transfer->newNode, $token);

            return $transfer;
        });

        return new JsonResponse($this->state(Server::query()->with('transfer')->findOrFail($serverId)));
    }

    /** @param  array<int, int>  $additional */
    private function assignAllocationsToServer(Server $server, int $nodeId, int $allocationId, array $additional): void
    {
        $unassigned = $this->allocations->getUnassignedAllocationIds($nodeId);
        $ids = array_values(array_filter([...$additional, $allocationId], fn ($allocation) => in_array($allocation, $unassigned)));

        if (!empty($ids)) {
            $this->allocations->updateWhereIn('id', $ids, ['server_id' => $server->id]);
        }
    }

    /** @return array<string, mixed> */
    private function state(Server $server): array
    {
        if ($server->status === Server::STATUS_INSTALL_FAILED) {
            throw new DisplayException('This server is in a failed install state and cannot be recovered. Please delete and re-create the server.');
        }

        return [
            'id' => $server->id,
            'name' => $server->name,
            'installed' => $server->isInstalled(),
            'suspended' => $server->isSuspended(),
            'can_reinstall' => $server->canBeReinstalled(),
            'can_transfer' => Node::query()->count() >= 2,
            'node_id' => $server->node_id,
            'transfer' => $server->transfer ? ['started' => $server->transfer->created_at->toIso8601String()] : null,
            'locations' => Location::query()->with('nodes:id,name,location_id')->orderBy('short')->get()->map(fn (Location $location) => [
                'id' => $location->id,
                'short' => $location->short,
                'long' => $location->long,
                'nodes' => $location->nodes->where('id', '!=', $server->node_id)->map(fn (Node $node) => ['id' => $node->id, 'name' => $node->name])->values()->all(),
            ])->values()->all(),
        ];
    }
}

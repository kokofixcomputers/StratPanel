<?php

namespace Pterodactyl\Services\Allocations;

use Pterodactyl\Models\Server;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Exceptions\Service\Allocation\NoAutoAllocationSpaceAvailableException;

class FindAssignableAllocationService
{
    /**
     * Finds a free allocation on the node of the server and assigns it to the server. Allocations on the same IP
     * address as the server's primary allocation are preferred, any other free allocation of the node is used when
     * there is none. Nothing is created here, the node has to have the free allocations (see the allocation tab of
     * the node), and there is no setting to turn this off.
     *
     * @throws \Pterodactyl\Exceptions\Service\Allocation\NoAutoAllocationSpaceAvailableException
     */
    public function handle(Server $server): Allocation
    {
        /** @var Allocation|null $allocation */
        $allocation = $server->node->allocations()
            ->lockForUpdate()
            ->whereNull('server_id')
            ->orderByRaw('ip = ? desc', [$server->allocation->ip])
            ->inRandomOrder()
            ->first();

        if (is_null($allocation)) {
            throw new NoAutoAllocationSpaceAvailableException();
        }

        $allocation->update(['server_id' => $server->id]);

        return $allocation->refresh();
    }
}

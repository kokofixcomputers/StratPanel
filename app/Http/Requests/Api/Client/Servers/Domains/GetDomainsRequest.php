<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Domains;

use Pterodactyl\Models\Permission;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class GetDomainsRequest extends ClientApiRequest
{
    /**
     * Anyone who can see the allocations of a server may see the domains pointing at them.
     */
    public function permission(): string
    {
        return Permission::ACTION_ALLOCATION_READ;
    }
}

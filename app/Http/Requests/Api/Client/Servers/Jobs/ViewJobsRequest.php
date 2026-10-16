<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Jobs;

use Pterodactyl\Models\Permission;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** Seeing the jobs of a server (and cancelling them, which the controller also checks) is for those who may look at its files. */
class ViewJobsRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_FILE_READ;
    }
}

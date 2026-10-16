<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Trash;

use Pterodactyl\Models\Permission;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class ListTrashRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_TRASH_READ;
    }

    public function rules(): array
    {
        return [];
    }
}

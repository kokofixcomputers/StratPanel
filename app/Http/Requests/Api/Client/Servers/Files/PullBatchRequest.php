<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Files;

use Pterodactyl\Models\Permission;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class PullBatchRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_FILE_CREATE;
    }

    public function rules(): array
    {
        return [
            'files' => 'required|array|min:1|max:' . (int) config('http.pull_batch_max', 500),
            'files.*.url' => 'required|string|url',
            'files.*.directory' => 'nullable|string',
            'files.*.filename' => 'nullable|string',
        ];
    }
}

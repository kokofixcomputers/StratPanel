<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Jobs;

use Pterodactyl\Models\Permission;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class PullJobRequest extends ClientApiRequest implements ClientPermissionsRequest
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

    /** @return list<array{url: string, directory: string, filename: string}> */
    public function files(): array
    {
        return array_map(fn (array $file) => array_filter([
            'url' => $file['url'],
            'directory' => ($file['directory'] ?? null) ?: '/',
            'filename' => $file['filename'] ?? null,
        ], fn ($value) => !is_null($value) && $value !== ''), array_values($this->input('files')));
    }
}

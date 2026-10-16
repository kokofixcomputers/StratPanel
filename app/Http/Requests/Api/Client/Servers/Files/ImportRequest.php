<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Files;

use Pterodactyl\Models\Permission;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class ImportRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_FILE_CREATE;
    }

    public function rules(): array
    {
        return [
            'protocol' => 'required|in:sftp,ftp',
            // A name or an address, nothing that carries a path or a port.
            'host' => ['required', 'string', 'max:255', 'regex:/^[A-Za-z0-9.\-:\[\]]+$/'],
            'port' => 'nullable|integer|between:1,65535',
            'username' => 'nullable|string|max:255',
            'password' => 'nullable|string|max:1024',
            'private_key' => 'nullable|string|max:20000',
            'passphrase' => 'nullable|string|max:1024',
            'tls' => 'boolean',
            'insecure_tls' => 'boolean',
            'fingerprint' => 'nullable|string|max:100',
            'path' => 'nullable|string|max:4096',
            'directory' => 'nullable|string|max:4096',
            'overwrite' => 'boolean',
        ];
    }

    /**
     * What the node needs, nothing else. Never logged.
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        return array_filter([
            'protocol' => $this->input('protocol'),
            'host' => $this->input('host'),
            'port' => $this->filled('port') ? (int) $this->input('port') : null,
            'username' => $this->input('username'),
            'password' => $this->input('password'),
            'private_key' => $this->input('private_key'),
            'passphrase' => $this->input('passphrase'),
            'tls' => $this->boolean('tls'),
            'insecure_tls' => $this->boolean('insecure_tls'),
            'fingerprint' => $this->input('fingerprint'),
            'path' => $this->input('path') ?: '/',
            'directory' => $this->input('directory') ?: '/',
            'overwrite' => $this->boolean('overwrite'),
        ], fn ($value) => !is_null($value) && $value !== '');
    }
}

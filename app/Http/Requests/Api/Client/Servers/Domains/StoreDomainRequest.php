<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Domains;

use Illuminate\Validation\Rule;
use Pterodactyl\Models\Permission;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class StoreDomainRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_ALLOCATION_UPDATE;
    }

    /**
     * Domains are case insensitive, store them in a single form so they can be matched exactly.
     */
    protected function prepareForValidation(): void
    {
        $this->merge(['domain' => strtolower(rtrim(trim((string) $this->input('domain')), '.'))]);
    }

    public function rules(): array
    {
        return [
            'domain' => [
                'required',
                'string',
                'max:253',
                'regex:/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/',
                Rule::unique('server_domains', 'domain'),
            ],
            'allocation_id' => ['required', 'integer'],
        ];
    }

    public function messages(): array
    {
        return [
            'domain.regex' => 'Enter a valid domain name such as play.example.com.',
            'domain.unique' => 'That domain is already in use.',
        ];
    }
}

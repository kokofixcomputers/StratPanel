<?php

namespace Pterodactyl\Http\Requests\Admin\Settings;

use Pterodactyl\Http\Requests\Admin\AdminFormRequest;

class CurseForgeFormRequest extends AdminFormRequest
{
    public function rules(): array
    {
        return [
            'remove_key' => 'nullable|boolean',
            // The keys CurseForge hands out are made of these characters, anything else is a typo or a paste of something else.
            'api_key' => ['required_without:remove_key', 'nullable', 'string', 'max:200', 'regex:/^[\w$.\/+=\-]+$/'],
        ];
    }

    public function attributes(): array
    {
        return [
            'api_key' => 'API key',
        ];
    }
}

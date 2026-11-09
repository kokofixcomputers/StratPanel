<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Subusers;

use Pterodactyl\Models\Permission;

class StoreSubuserRequest extends SubuserRequest
{
    public function permission(): string
    {
        return Permission::ACTION_USER_CREATE;
    }

    public function rules(): array
    {
        return [
            // Invited by email address, or by the Minecraft name of somebody who linked their account.
            'email' => 'required_without:minecraft|nullable|email:strict|between:1,191',
            'minecraft' => ['required_without:email', 'nullable', 'string', 'regex:/^\w{1,16}$/'],
            'permissions' => 'required|array',
            'permissions.*' => 'string',
        ];
    }
}

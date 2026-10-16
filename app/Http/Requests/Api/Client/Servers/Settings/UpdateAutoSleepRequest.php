<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Settings;

use Illuminate\Validation\Rule;
use Pterodactyl\Models\Permission;
use Pterodactyl\Models\ServerAutoSleep;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class UpdateAutoSleepRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permission::ACTION_SETTINGS_AUTO_SLEEP;
    }

    public function rules(): array
    {
        return [
            'enabled' => 'required|boolean',
            'idle_minutes' => ['required', 'integer', Rule::in(ServerAutoSleep::IDLE_CHOICES)],
            'wake_on_join' => 'required|boolean',
        ];
    }
}

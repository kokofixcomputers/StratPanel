<?php

namespace Pterodactyl\Transformers\Api\Client;

use Illuminate\Support\Str;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Minecraft\MinecraftLinkService;

class UserTransformer extends BaseClientTransformer
{
    /**
     * Return the resource name for the JSONAPI output.
     */
    public function getResourceName(): string
    {
        return User::RESOURCE_NAME;
    }

    /**
     * Transforms a User model into a representation that can be shown to regular
     * users of the API.
     */
    public function transform(User $model): array
    {
        return [
            'uuid' => $model->uuid,
            'identifier' => $model->identifier,
            'username' => $model->username,
            'email' => $model->email,
            // The head of the linked Minecraft account when there is one, else the gravatar.
            'image' => MinecraftLinkService::avatar($model->minecraft_uuid) ?? 'https://gravatar.com/avatar/' . md5(Str::lower($model->email)),
            'minecraft' => $model->minecraft_uuid ? ['uuid' => $model->minecraft_uuid, 'username' => $model->minecraft_username] : null,
            '2fa_enabled' => $model->use_totp,
            'created_at' => $model->created_at->toAtomString(),
        ];
    }
}

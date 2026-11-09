<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A code the Minecraft router gave to a player who proved with Mojang that their account is theirs. Typing it into the account page of
 * the panel links that Minecraft account to the panel account.
 *
 * @property int $id
 * @property string $code
 * @property string $minecraft_uuid
 * @property string $minecraft_username
 * @property \Carbon\CarbonImmutable $expires_at
 */
class MinecraftLinkCode extends Model
{
    protected $table = 'minecraft_link_codes';

    protected $guarded = ['id'];

    protected $casts = ['expires_at' => 'datetime'];
}

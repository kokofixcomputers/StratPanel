<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Skin heads
    |--------------------------------------------------------------------------
    |
    | Where the avatar of a person with a linked Minecraft account comes from. {uuid} is the UUID of the account (no dashes). Any service
    | that draws the head of a skin from a UUID works, for example https://crafatar.com/avatars/{uuid}?size=128&overlay.
    */
    'avatar_url' => env('MINECRAFT_AVATAR_URL', 'https://mc-heads.net/avatar/{uuid}/128'),
];

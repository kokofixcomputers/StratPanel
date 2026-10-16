<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A passkey of a user: a key pair on their device or in their password manager, of which the panel keeps the public half.
 *
 * @property int $id
 * @property int $user_id
 * @property string $name
 * @property string $credential_id
 * @property string $record
 * @property \Carbon\CarbonImmutable|null $last_used_at
 * @property \Carbon\CarbonImmutable $created_at
 * @property \Pterodactyl\Models\User $user
 */
class UserPasskey extends Model
{
    protected $table = 'user_passkeys';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $hidden = ['record'];

    protected function casts(): array
    {
        return ['last_used_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The account of a user at a service they can sign in with.
 *
 * @property int $id
 * @property int $user_id
 * @property int $auth_provider_id
 * @property string $provider_user_id
 * @property string|null $email
 * @property string|null $display_name
 * @property \Carbon\CarbonImmutable|null $last_used_at
 * @property \Carbon\CarbonImmutable $created_at
 * @property \Pterodactyl\Models\User $user
 * @property \Pterodactyl\Models\AuthProvider $provider
 */
class UserIdentity extends Model
{
    protected $table = 'user_identities';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['last_used_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(AuthProvider::class, 'auth_provider_id');
    }
}

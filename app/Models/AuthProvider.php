<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A service people can sign in with (GitHub, Google, Discord, or any OAuth 2 service), set up by an admin.
 *
 * @property int $id
 * @property string $key
 * @property string $type
 * @property string $name
 * @property string $client_id
 * @property string $client_secret
 * @property string|null $scopes
 * @property array|null $endpoints
 * @property bool $enabled
 * @property bool $allow_signup
 */
class AuthProvider extends Model
{
    public const KEY_REGEX = '/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/';

    protected $table = 'auth_providers';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    /** The secret never leaves the server, not even in an array or JSON by accident. */
    protected $hidden = ['client_secret'];

    protected function casts(): array
    {
        return [
            'client_secret' => 'encrypted',
            'endpoints' => 'array',
            'enabled' => 'boolean',
            'allow_signup' => 'boolean',
        ];
    }

    public function identities(): HasMany
    {
        return $this->hasMany(UserIdentity::class);
    }
}

<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Pterodactyl\Services\Roles\PermissionRegistry;

/**
 * A named set of administration permissions that can be given to users.
 *
 * @property int $id
 * @property string $name
 * @property string|null $description
 * @property string $color
 * @property list<string> $permissions
 * @property list<string>|null $denied
 * @property \Illuminate\Database\Eloquent\Collection<int, User> $users
 */
class Role extends Model
{
    protected $table = 'roles';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['permissions' => 'array', 'denied' => 'array'];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'role_user')->withPivot('created_at')->orderBy('users.username');
    }

    /** The admin permissions the role grants that exist (a permission that was taken out of the panel is ignored). */
    public function permissionList(): array
    {
        return array_values(array_filter(
            PermissionRegistry::normalize((array) $this->permissions),
            fn (string $key) => !PermissionRegistry::isUser($key)
        ));
    }

    /** What the role grants of what everybody may do (see PermissionRegistry::user()). */
    public function userGrantList(): array
    {
        return array_values(array_filter(
            PermissionRegistry::normalize((array) $this->permissions),
            fn (string $key) => PermissionRegistry::isUser($key)
        ));
    }

    /** Everything the role takes away, admin permissions and the ones of everybody. A denial wins over a grant of any role. */
    public function deniedList(): array
    {
        return PermissionRegistry::normalizeDenied((array) $this->denied);
    }

    public function holds(string $permission): bool
    {
        return in_array($permission, $this->permissionList(), true);
    }
}

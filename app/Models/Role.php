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
 * @property \Illuminate\Database\Eloquent\Collection<int, User> $users
 */
class Role extends Model
{
    protected $table = 'roles';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return ['permissions' => 'array'];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'role_user')->withPivot('created_at')->orderBy('users.username');
    }

    /** The permissions the role holds that exist (a permission that was taken out of the panel is ignored). */
    public function permissionList(): array
    {
        return PermissionRegistry::normalize((array) $this->permissions);
    }

    public function holds(string $permission): bool
    {
        return in_array($permission, $this->permissionList(), true);
    }
}

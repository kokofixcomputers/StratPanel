<?php

namespace Pterodactyl\Services\Roles;

use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Exceptions\DisplayException;

/**
 * Making, changing and giving roles, with the rules that keep roles from being a way to get more than one has:
 *
 *  - a role can only hold permissions the person making or changing it holds themselves,
 *  - a role can only be changed, removed, given or taken away by somebody who holds all of its permissions,
 *  - the accounts of root admins, and of people who hold more than you do, can not be given roles or have them taken away.
 *
 * Root admins hold everything, so none of this limits them.
 */
class RoleService
{
    /** Whether the user holds every permission of the role (always true for root admins). */
    public function covers(User $actor, Role $role): bool
    {
        return $actor->root_admin || count(array_diff($role->permissionList(), $actor->rolePermissions())) === 0;
    }

    /**
     * @param  array<string, mixed>  $data  name, description, color, permissions
     *
     * @throws DisplayException
     */
    public function create(User $actor, array $data): Role
    {
        $permissions = PermissionRegistry::normalize($data['permissions'] ?? []);
        $this->checkGrantable($actor, $permissions);

        $role = Role::query()->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'color' => $data['color'] ?? '#3b82f6',
            'permissions' => $permissions,
        ]);

        Activity::event('role:create')->actor($actor)->subject($role)->property(['name' => $role->name, 'permissions' => $permissions])->log();

        return $role;
    }

    /**
     * @param  array<string, mixed>  $data
     *
     * @throws DisplayException
     */
    public function update(User $actor, Role $role, array $data): Role
    {
        $this->checkCovers($actor, $role);

        $permissions = PermissionRegistry::normalize($data['permissions'] ?? []);
        $this->checkGrantable($actor, $permissions);

        $before = $role->permissionList();
        $role->forceFill([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'color' => $data['color'] ?? $role->color,
            'permissions' => $permissions,
        ])->save();

        // Everybody who has the role has other permissions now.
        $role->users->each->forgetPermissions();

        Activity::event('role:update')->actor($actor)->subject($role)->property([
            'name' => $role->name,
            'added' => array_values(array_diff($permissions, $before)),
            'removed' => array_values(array_diff($before, $permissions)),
        ])->log();

        return $role;
    }

    /** @throws DisplayException */
    public function delete(User $actor, Role $role): void
    {
        $this->checkCovers($actor, $role);

        $members = $role->users()->get();
        $role->delete();
        $members->each->forgetPermissions();

        Activity::event('role:delete')->actor($actor)->property(['name' => $role->name, 'members' => $members->count()])->log();
    }

    /** @throws DisplayException */
    public function assign(User $actor, Role $role, User $target): void
    {
        $this->checkCanTouch($actor, $role, $target);

        $role->users()->syncWithoutDetaching([$target->id => ['created_at' => now()]]);
        $target->forgetPermissions();

        Activity::event('role:assign')->actor($actor)->subject($target)->property(['role' => $role->name])->log();
    }

    /** @throws DisplayException */
    public function revoke(User $actor, Role $role, User $target): void
    {
        $this->checkCanTouch($actor, $role, $target);

        $role->users()->detach($target->id);
        $target->forgetPermissions();

        Activity::event('role:revoke')->actor($actor)->subject($target)->property(['role' => $role->name])->log();
    }

    /**
     * Sets the roles of a user to these ones, as far as the actor may: roles they may not touch stay as they are.
     *
     * @param  list<int>  $roleIds
     *
     * @throws DisplayException
     */
    public function sync(User $actor, User $target, array $roleIds): void
    {
        $wanted = Role::query()->whereIn('id', $roleIds)->get()->keyBy('id');
        $current = $target->roles()->get()->keyBy('id');

        foreach ($wanted->diffKeys($current) as $role) {
            $this->assign($actor, $role, $target);
        }
        foreach ($current->diffKeys($wanted) as $role) {
            $this->revoke($actor, $role, $target);
        }
    }

    /** @throws DisplayException */
    private function checkCovers(User $actor, Role $role): void
    {
        if (!$this->covers($actor, $role)) {
            throw new DisplayException('This role holds permissions that you do not hold yourself, so you can not change it.');
        }
    }

    /**
     * @param  list<string>  $permissions
     *
     * @throws DisplayException
     */
    private function checkGrantable(User $actor, array $permissions): void
    {
        if (!$actor->root_admin && ($missing = array_diff($permissions, $actor->rolePermissions()))) {
            throw new DisplayException('You can only give a role permissions that you hold yourself. Not allowed: ' . implode(', ', $missing) . '.');
        }
    }

    /** @throws DisplayException */
    private function checkCanTouch(User $actor, Role $role, User $target): void
    {
        $this->checkCovers($actor, $role);

        if ($actor->id !== $target->id && !$actor->outranks($target)) {
            throw new DisplayException('You can not change the roles of an account that holds more than you do.');
        }
    }
}

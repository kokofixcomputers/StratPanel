<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Illuminate\Validation\Rule;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Roles\RoleService;
use Pterodactyl\Services\Roles\PermissionRegistry;

/**
 * Roles for the admin pages. The rules of who may give what to whom are in RoleService, this only asks and answers.
 */
class RolesController extends Controller
{
    public function __construct(private RoleService $roles)
    {
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'root_admins' => User::query()->where('root_admin', true)->count(),
            'roles' => Role::query()->withCount('users')->orderBy('name')->get()->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'description' => $role->description,
                'color' => $role->color,
                'permissions' => count($role->permissionList()) + count($role->userGrantList()),
                'denied' => count($role->deniedList()),
                'users' => (int) $role->users_count,
            ])->values()->all(),
        ]);
    }

    /** Every permission, grouped as the editor shows them, and what the person asking holds (null: everything, a root admin). */
    public function permissions(Request $request): JsonResponse
    {
        $groups = [];
        foreach (PermissionRegistry::groups() as $id => $group) {
            $groups[] = $this->group($id, $group['label'], $group['description'], $group['permissions'], false);
        }
        $groups[] = $this->group(
            'self',
            'Everybody',
            'What every account can do without a role. A role can take it away (deny), or, where the panel has a switch for it, allow it for the people who have the role.',
            PermissionRegistry::user(),
            true
        );

        return new JsonResponse([
            'groups' => $groups,
            'mine' => $request->user()->root_admin ? null : $request->user()->rolePermissions(),
        ]);
    }

    public function view(Request $request, int $role): JsonResponse
    {
        $role = Role::query()->findOrFail($role);

        return new JsonResponse([
            'role' => $this->role($role),
            // Whether the person asking holds everything the role holds: otherwise the role can be looked at but not changed.
            'covers' => $this->roles->covers($request->user(), $role),
            'members' => $role->users()->get()->map(fn (User $user) => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'root_admin' => (bool) $user->root_admin,
                'since' => optional($user->pivot->created_at)->toIso8601String(),
            ])->values()->all(),
        ]);
    }

    /** @throws DisplayException */
    public function store(Request $request): JsonResponse
    {
        $role = $this->roles->create($request->user(), $this->input($request));

        return new JsonResponse($this->role($role), 201);
    }

    /** @throws DisplayException */
    public function update(Request $request, int $role): JsonResponse
    {
        $role = Role::query()->findOrFail($role);

        return new JsonResponse($this->role($this->roles->update($request->user(), $role, $this->input($request, $role))));
    }

    /** @throws DisplayException */
    public function destroy(Request $request, int $role): JsonResponse
    {
        $this->roles->delete($request->user(), Role::query()->findOrFail($role));

        return new JsonResponse([], 204);
    }

    /** @throws DisplayException */
    public function addMember(Request $request, int $role): JsonResponse
    {
        $role = Role::query()->findOrFail($role);
        $data = $request->validate(['user' => 'required|string|max:191']);
        $user = User::query()->where('username', $data['user'])->orWhere('email', $data['user'])->first();
        if ($user === null) {
            throw new DisplayException('There is no user with that username or email address.');
        }

        $this->roles->assign($request->user(), $role, $user);

        return new JsonResponse(['id' => $user->id, 'username' => $user->username], 201);
    }

    /** @throws DisplayException */
    public function removeMember(Request $request, int $role, int $person): JsonResponse
    {
        $this->roles->revoke($request->user(), Role::query()->findOrFail($role), User::query()->findOrFail($person));

        return new JsonResponse([], 204);
    }

    /**
     * What the form sends: one choice for each permission (states[key] = grant, deny or default). The two lists of permissions to grant
     * and to deny are understood as well, for whatever else talks to this.
     *
     * @return array<string, mixed>
     */
    private function input(Request $request, ?Role $role = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('roles', 'name')->ignore($role?->id)],
            'description' => 'nullable|string|max:255',
            'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'states' => 'nullable|array',
            'states.*' => 'nullable|in:grant,deny,default',
            'permissions' => 'nullable|array',
            'permissions.*' => 'string',
            'denied' => 'nullable|array',
            'denied.*' => 'string',
        ]);
        if (isset($data['states'])) {
            $data['permissions'] = array_keys(array_filter($data['states'], fn ($state) => $state === 'grant'));
            $data['denied'] = array_keys(array_filter($data['states'], fn ($state) => $state === 'deny'));
        }

        return $data;
    }

    /** @return array<string, mixed> */
    private function role(Role $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'description' => $role->description,
            'color' => $role->color,
            'granted' => PermissionRegistry::normalize((array) $role->permissions),
            'denied' => $role->deniedList(),
        ];
    }

    /**
     * @param  array<string, string>  $permissions
     * @return array<string, mixed>
     */
    private function group(string $id, string $label, string $description, array $permissions, bool $everybody): array
    {
        $list = [];
        foreach ($permissions as $key => $text) {
            $list[] = ['key' => $key, 'label' => $text, 'needs' => PermissionRegistry::viewOf($key), 'everybody' => $everybody];
        }

        return ['id' => $id, 'label' => $label, 'description' => $description, 'permissions' => $list];
    }
}

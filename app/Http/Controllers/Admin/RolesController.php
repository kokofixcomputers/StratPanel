<?php

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Illuminate\Validation\Rule;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Roles\RoleService;
use Pterodactyl\Services\Roles\PermissionRegistry;

class RolesController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private RoleService $roles)
    {
    }

    public function index(): View
    {
        return view('admin.roles.index', [
            'roles' => Role::query()->withCount('users')->orderBy('name')->get(),
        ]);
    }

    public function create(): View
    {
        return $this->form(new Role(['color' => '#3b82f6', 'permissions' => []]), false);
    }

    /**
     * @throws DisplayException
     */
    public function store(Request $request): RedirectResponse
    {
        $role = $this->roles->create($request->user(), $request->validate($this->rules()));

        $this->alert->success($role->name . ' was created.')->flash();

        return redirect()->route('admin.roles.view', $role->id);
    }

    public function view(Request $request, Role $role): View
    {
        return $this->form($role, true);
    }

    /**
     * @throws DisplayException
     */
    public function update(Request $request, Role $role): RedirectResponse
    {
        $this->roles->update($request->user(), $role, $request->validate($this->rules($role)));

        $this->alert->success($role->name . ' was saved.')->flash();

        return redirect()->route('admin.roles.view', $role->id);
    }

    /**
     * @throws DisplayException
     */
    public function destroy(Request $request, Role $role): RedirectResponse
    {
        $this->roles->delete($request->user(), $role);

        $this->alert->success($role->name . ' was deleted. The people who had it no longer have what it gave them.')->flash();

        return redirect()->route('admin.roles');
    }

    /**
     * @throws DisplayException
     */
    public function addMember(Request $request, Role $role): RedirectResponse
    {
        $data = $request->validate(['user' => 'required|string|max:191']);
        $user = User::query()->where('username', $data['user'])->orWhere('email', $data['user'])->first();
        if ($user === null) {
            throw new DisplayException('There is no user with that username or email address.');
        }

        $this->roles->assign($request->user(), $role, $user);
        $this->alert->success($user->username . ' now has ' . $role->name . '.')->flash();

        return redirect()->route('admin.roles.view', $role->id);
    }

    /**
     * @throws DisplayException
     */
    public function removeMember(Request $request, Role $role, User $user): RedirectResponse
    {
        $this->roles->revoke($request->user(), $role, $user);
        $this->alert->success($user->username . ' no longer has ' . $role->name . '.')->flash();

        return redirect()->route('admin.roles.view', $role->id);
    }

    /** Sets the roles of a user from their page: Users > a user > Roles. */
    public function syncUser(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate(['roles' => 'nullable|array', 'roles.*' => 'integer|exists:roles,id']);
        $this->roles->sync($request->user(), $user, array_map('intval', $data['roles'] ?? []));

        $this->alert->success('The roles of ' . $user->username . ' were saved.')->flash();

        return redirect()->route('admin.users.view', $user->id);
    }

    private function form(Role $role, bool $exists): View
    {
        return view('admin.roles.view', [
            'role' => $role,
            'exists' => $exists,
            'groups' => PermissionRegistry::groups(),
            'held' => $role->permissionList(),
            'covers' => $exists ? $this->roles->covers(request()->user(), $role) : true,
            'members' => $exists ? $role->users()->get() : collect(),
            'mine' => request()->user()->root_admin ? null : request()->user()->rolePermissions(),
        ]);
    }

    /** @return array<string, mixed> */
    private function rules(?Role $role = null): array
    {
        return [
            'name' => ['required', 'string', 'max:60', Rule::unique('roles', 'name')->ignore($role?->id)],
            'description' => 'nullable|string|max:255',
            'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'permissions' => 'nullable|array',
            'permissions.*' => 'string',
        ];
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\User;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Roles\RoleService;

/**
 * What is left of roles in Blade: the roles box on the page of a user (the roles themselves are in the React app, see
 * Api\Client\Admin\RolesController).
 */
class RolesController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private RoleService $roles)
    {
    }

    /** Sets the roles of a user from their page: Users > a user > Roles. */
    public function syncUser(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate(['roles' => 'nullable|array', 'roles.*' => 'integer|exists:roles,id']);
        $this->roles->sync($request->user(), $user, array_map('intval', $data['roles'] ?? []));

        $this->alert->success('The roles of ' . $user->username . ' were saved.')->flash();

        return redirect()->route('admin.users.view', $user->id);
    }
}

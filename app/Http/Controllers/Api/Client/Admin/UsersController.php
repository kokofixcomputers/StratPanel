<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Pterodactyl\Facades\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Roles\RoleService;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Services\Users\UserUpdateService;
use Pterodactyl\Traits\Helpers\AvailableLanguages;
use Pterodactyl\Services\Users\UserCreationService;
use Pterodactyl\Services\Users\UserDeletionService;
use Pterodactyl\Http\Controllers\Api\Client\Admin\Concerns\FormatsAdminResponses;

/** Users for the admin pages. Who may change whom is decided here and in RoleService, as it always was. */
class UsersController extends Controller
{
    use AvailableLanguages;
    use FormatsAdminResponses;

    public function __construct(
        private UserCreationService $creationService,
        private UserUpdateService $updateService,
        private UserDeletionService $deletionService,
        private RoleService $roles,
        private ResourcePool $pools,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $users = User::query()->select('users.*')
            ->selectRaw('COUNT(DISTINCT(subusers.id)) as subuser_of_count')
            ->selectRaw('COUNT(DISTINCT(servers.id)) as servers_count')
            ->leftJoin('subusers', 'subusers.user_id', '=', 'users.id')
            ->leftJoin('servers', 'servers.owner_id', '=', 'users.id')
            ->when($search !== '', fn ($query) => $query->where(fn ($inner) => $inner
                ->where('users.email', 'like', "%$search%")
                ->orWhere('users.username', 'like', "%$search%")))
            ->groupBy('users.id')
            ->with('roles')
            ->orderByDesc('root_admin')
            ->orderBy('users.id')
            ->paginate(50);

        return new JsonResponse([
            'users' => $users->map(fn (User $user) => [
                'id' => $user->id,
                'email' => $user->email,
                'username' => $user->username,
                'name_first' => $user->name_first,
                'name_last' => $user->name_last,
                'use_totp' => (bool) $user->use_totp,
                'root_admin' => (bool) $user->root_admin,
                'servers' => (int) $user->servers_count,
                'subuser_of' => (int) $user->subuser_of_count,
                'gravatar' => 'https://www.gravatar.com/avatar/' . md5(strtolower($user->email)) . '?s=100',
                'roles' => $user->roles->map(fn (Role $role) => ['id' => $role->id, 'name' => $role->name, 'color' => $role->color])->values()->all(),
            ])->values()->all(),
            'pagination' => $this->pagination($users),
        ]);
    }

    /** What the form of a new user needs. */
    public function meta(): JsonResponse
    {
        return new JsonResponse(['languages' => $this->getAvailableLanguages(true), 'locale' => config('app.locale')]);
    }

    public function view(Request $request, int $person): JsonResponse
    {
        $found = User::query()->findOrFail($person);
        $actor = $request->user();
        $canChange = $actor->outranks($found);
        $assigned = $found->roles()->pluck('roles.id')->all();

        return new JsonResponse([
            'user' => $this->user($found),
            'languages' => $this->getAvailableLanguages(true),
            'can_change' => $canChange,
            'roles' => Role::query()->orderBy('name')->get()->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'description' => $role->description,
                'color' => $role->color,
                'assigned' => in_array($role->id, $assigned, true),
                // Whoever gives a role has to hold all of it, and may only change an account that holds no more than they do.
                'assignable' => $actor->hasPermission('roles.assign') && $canChange && $this->roles->covers($actor, $role),
            ])->values()->all(),
            'pool' => $this->pool($found),
        ]);
    }

    /** @throws \Throwable */
    public function store(Request $request): JsonResponse
    {
        $rules = Collection::make(User::getRules())->only(['email', 'username', 'name_first', 'name_last', 'password', 'language', 'root_admin'])->toArray();
        $request->validate($rules);
        $user = $this->creationService->handle($this->withoutRootAdmin($request, $request->only(array_keys($rules))));

        return new JsonResponse($this->user($user), 201);
    }

    /** @throws \Throwable */
    public function update(Request $request, int $person): JsonResponse
    {
        $found = User::query()->findOrFail($person);
        $this->guardAgainstOutranking($request, $found);

        $rules = Collection::make(User::getRulesForUpdate($found))->only(['email', 'username', 'name_first', 'name_last', 'password', 'language', 'root_admin'])->toArray();
        $request->validate($rules);
        $this->updateService->setUserLevel(User::USER_LEVEL_ADMIN)->handle($found, $this->withoutRootAdmin($request, $request->only(array_keys($rules))));

        return new JsonResponse($this->user($found->refresh()));
    }

    /** @throws \Throwable */
    public function destroy(Request $request, int $person): JsonResponse
    {
        $found = User::query()->findOrFail($person);
        if ($request->user()->is($found)) {
            throw new DisplayException(__('admin/user.exceptions.delete_self'));
        }
        $this->guardAgainstOutranking($request, $found);

        $this->deletionService->handle($found);

        return new JsonResponse([], 204);
    }

    /** Sets the roles of a person to these ones, as far as the actor may: roles they may not touch stay as they are. */
    public function syncRoles(Request $request, int $person): JsonResponse
    {
        $found = User::query()->findOrFail($person);
        $data = $request->validate(['roles' => 'nullable|array', 'roles.*' => 'integer|exists:roles,id']);
        $this->roles->sync($request->user(), $found, array_map('intval', $data['roles'] ?? []));

        return new JsonResponse(['roles' => $found->roles()->pluck('roles.id')->all()]);
    }

    /** The pool of one person; a field left empty means the default of the panel. */
    public function updatePool(Request $request, int $person): JsonResponse
    {
        $found = User::query()->findOrFail($person);
        $this->guardAgainstOutranking($request, $found);

        $data = $request->validate([
            'memory' => 'nullable|integer|between:0,100000000',
            'disk' => 'nullable|integer|between:0,100000000',
            'cpu' => 'nullable|integer|between:0,100000',
            'allocations' => 'nullable|integer|between:0,1000',
            'backups' => 'nullable|integer|between:0,10000',
        ]);

        $before = [];
        $after = [];
        foreach (ResourcePool::RESOURCES as $resource) {
            $before[$resource] = $found->getAttribute('pool_' . $resource);
            $value = $data[$resource] ?? null;
            $after[$resource] = $value === null || $value === '' ? null : (int) $value;
            $found->forceFill(['pool_' . $resource => $after[$resource]]);
        }
        $found->save();

        Activity::event('user:pool.update')->actor($request->user())->subject($found)->property(['before' => $before, 'after' => $after])->log();

        return new JsonResponse($this->pool($found));
    }

    /**
     * Somebody with a role can not change the account of a root admin, or of somebody who holds more than they do: with the email or
     * password of that account they would hold it too.
     *
     * @throws DisplayException
     */
    private function guardAgainstOutranking(Request $request, User $target): void
    {
        if ($request->user()->id !== $target->id && !$request->user()->outranks($target)) {
            throw new DisplayException('You can not change an account that holds more than you do.');
        }
    }

    /**
     * Only root admins make root admins. For everybody else the field is dropped, so a request that has it added by hand changes nothing.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function withoutRootAdmin(Request $request, array $data): array
    {
        if (!$request->user()->root_admin) {
            unset($data['root_admin']);
        }

        return $data;
    }

    /** @return array<string, mixed> */
    private function user(User $user): array
    {
        return [
            'id' => $user->id,
            'email' => $user->email,
            'username' => $user->username,
            'name_first' => $user->name_first,
            'name_last' => $user->name_last,
            'language' => $user->language,
            'root_admin' => (bool) $user->root_admin,
        ];
    }

    /** @return array<string, mixed> */
    private function pool(User $user): array
    {
        return [
            'enabled' => $this->pools->enabled(),
            'unlimited' => $user->hasPermission('servers.create'),
            'defaults' => $this->pools->defaults(),
            'limits' => $this->pools->limits($user),
            'used' => $this->pools->used($user),
            'own' => array_map(fn (string $resource) => $user->getAttribute('pool_' . $resource), array_combine(ResourcePool::RESOURCES, ResourcePool::RESOURCES)),
        ];
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Model;
use Pterodactyl\Models\Role;
use Pterodactyl\Services\Roles\RoleService;
use Illuminate\Support\Collection;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Spatie\QueryBuilder\QueryBuilder;
use Illuminate\View\Factory as ViewFactory;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Illuminate\Contracts\Translation\Translator;
use Pterodactyl\Services\Users\UserUpdateService;
use Pterodactyl\Traits\Helpers\AvailableLanguages;
use Pterodactyl\Services\Users\UserCreationService;
use Pterodactyl\Services\Users\UserDeletionService;
use Pterodactyl\Http\Requests\Admin\UserFormRequest;
use Pterodactyl\Http\Requests\Admin\NewUserFormRequest;
use Pterodactyl\Contracts\Repository\UserRepositoryInterface;

class UserController extends Controller
{
    use AvailableLanguages;

    /**
     * UserController constructor.
     */
    public function __construct(
        protected AlertsMessageBag $alert,
        protected UserCreationService $creationService,
        protected UserDeletionService $deletionService,
        protected Translator $translator,
        protected UserUpdateService $updateService,
        protected UserRepositoryInterface $repository,
        protected ViewFactory $view,
    ) {
    }

    /**
     * Display user index page.
     */
    public function index(Request $request): View
    {
        $users = QueryBuilder::for(
            User::query()->select('users.*')
                ->selectRaw('COUNT(DISTINCT(subusers.id)) as subuser_of_count')
                ->selectRaw('COUNT(DISTINCT(servers.id)) as servers_count')
                ->leftJoin('subusers', 'subusers.user_id', '=', 'users.id')
                ->leftJoin('servers', 'servers.owner_id', '=', 'users.id')
                ->groupBy('users.id')
                ->with('roles')
        )
            ->allowedFilters(['username', 'email', 'uuid'])
            ->defaultSort('-root_admin')
            ->allowedSorts(['id', 'uuid'])
            ->paginate(50);

        return view('admin.users.index', ['users' => $users]);
    }

    /**
     * Display new user page.
     */
    public function create(): View
    {
        return view('admin.users.new', [
            'languages' => $this->getAvailableLanguages(true),
        ]);
    }

    /**
     * Display user view page.
     */
    public function view(Request $request, User $user): View
    {
        return view('admin.users.view', [
            'user' => $user,
            'languages' => $this->getAvailableLanguages(true),
            'roles' => Role::query()->orderBy('name')->get(),
            'userRoleIds' => $user->roles()->pluck('roles.id')->all(),
            'canChange' => $request->user()->outranks($user),
            'roleService' => app(RoleService::class),
        ]);
    }

    /**
     * Delete a user from the system.
     *
     * @throws \Exception
     * @throws DisplayException
     */
    public function delete(Request $request, User $user): RedirectResponse
    {
        if ($request->user()->is($user)) {
            throw new DisplayException(__('admin/user.exceptions.delete_self'));
        }
        $this->guardAgainstOutranking($request, $user);

        $this->deletionService->handle($user);

        return redirect()->route('admin.users');
    }

    /**
     * Create a user.
     *
     * @throws \Exception
     * @throws \Throwable
     */
    public function store(NewUserFormRequest $request): RedirectResponse
    {
        $user = $this->creationService->handle($this->withoutRootAdmin($request, $request->normalize()));
        $this->alert->success($this->translator->get('admin/user.notices.account_created'))->flash();

        return redirect()->route('admin.users.view', $user->id);
    }

    /**
     * Update a user on the system.
     *
     * @throws \Pterodactyl\Exceptions\Model\DataValidationException
     * @throws \Pterodactyl\Exceptions\Repository\RecordNotFoundException
     */
    public function update(UserFormRequest $request, User $user): RedirectResponse
    {
        $this->guardAgainstOutranking($request, $user);

        $this->updateService
            ->setUserLevel(User::USER_LEVEL_ADMIN)
            ->handle($user, $this->withoutRootAdmin($request, $request->normalize()));

        $this->alert->success(trans('admin/user.notices.account_updated'))->flash();

        return redirect()->route('admin.users.view', $user->id);
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
     * Only root admins make root admins. For everybody else the field is dropped, so a form that has it added by hand changes nothing.
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

    /**
     * Get a JSON response of users on the system.
     */
    public function json(Request $request): Model|Collection
    {
        $users = QueryBuilder::for(User::query())->allowedFilters(['email'])->paginate(25);

        // Handle single user requests.
        if ($request->query('user_id')) {
            $user = User::query()->findOrFail($request->input('user_id'));
            // @phpstan-ignore-next-line property.notFound
            $user->md5 = md5(strtolower($user->email));

            return $user;
        }

        return $users->map(function ($item) {
            // @phpstan-ignore-next-line property.notFound
            $item->md5 = md5(strtolower($item->email));

            return $item;
        });
    }
}

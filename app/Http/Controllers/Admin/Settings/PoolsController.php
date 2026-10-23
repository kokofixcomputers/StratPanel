<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Pterodactyl\Models\User;
use Pterodactyl\Facades\Activity;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Services\Pools\ResourcePool;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * Settings > Resource pools: whether the servers people make for themselves are paid from a pool of memory, disk, CPU and allocations
 * instead of counted, and what a person gets who was not given a pool of their own. A person's own pool is set on their user page.
 */
class PoolsController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private SettingsRepositoryInterface $settings, private ResourcePool $pools)
    {
    }

    public function index(): View
    {
        return view('admin.settings.pools', [
            'enabled' => $this->pools->enabled(),
            'defaults' => $this->pools->defaults(),
            'own' => User::query()->where(function ($query) {
                foreach (ResourcePool::RESOURCES as $resource) {
                    $query->orWhereNotNull('pool_' . $resource);
                }
            })->count(),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'memory' => 'required|integer|between:0,100000000',
            'disk' => 'required|integer|between:0,100000000',
            'cpu' => 'required|integer|between:0,100000',
            'allocations' => 'required|integer|between:0,1000',
        ]);

        $this->settings->set('settings::pterodactyl:pools:enabled', $request->boolean('enabled') ? 'true' : 'false');
        foreach ($data as $key => $value) {
            $this->settings->set('settings::pterodactyl:pools:' . $key, (string) $value);
        }

        $this->alert->success('Resource pool settings were saved.')->flash();

        return redirect()->route('admin.settings.pools');
    }

    /**
     * The pool of one person, from their page in Users. A field left empty means the default of the panel.
     *
     * @throws DisplayException
     */
    public function updateUser(Request $request, User $user): RedirectResponse
    {
        $actor = $request->user();
        if ($actor->id !== $user->id && !$actor->outranks($user)) {
            throw new DisplayException('You can not change an account that holds more than you do.');
        }

        $data = $request->validate([
            'memory' => 'nullable|integer|between:0,100000000',
            'disk' => 'nullable|integer|between:0,100000000',
            'cpu' => 'nullable|integer|between:0,100000',
            'allocations' => 'nullable|integer|between:0,1000',
        ]);

        $before = array_map(fn (string $resource) => $user->getAttribute('pool_' . $resource), array_combine(ResourcePool::RESOURCES, ResourcePool::RESOURCES));
        $after = [];
        foreach (ResourcePool::RESOURCES as $resource) {
            $value = $data[$resource] ?? null;
            $after[$resource] = $value === null || $value === '' ? null : (int) $value;
            $user->forceFill(['pool_' . $resource => $after[$resource]]);
        }
        $user->save();

        Activity::event('user:pool.update')->actor($actor)->subject($user)->property(['before' => $before, 'after' => $after])->log();
        $this->alert->success('The resource pool of ' . $user->username . ' was saved.')->flash();

        return redirect()->route('admin.users.view', $user->id);
    }
}

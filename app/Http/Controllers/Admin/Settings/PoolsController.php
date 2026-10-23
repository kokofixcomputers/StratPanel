<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Pterodactyl\Models\User;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Services\Pools\ResourcePool;
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
            'backups' => 'required|integer|between:0,10000',
        ]);

        $this->settings->set('settings::pterodactyl:pools:enabled', $request->boolean('enabled') ? 'true' : 'false');
        foreach ($data as $key => $value) {
            $this->settings->set('settings::pterodactyl:pools:' . $key, (string) $value);
        }

        $this->alert->success('Resource pool settings were saved.')->flash();

        return redirect()->route('admin.settings.pools');
    }
}

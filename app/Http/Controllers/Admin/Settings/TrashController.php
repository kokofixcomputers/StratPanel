<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Models\ServerTrashItem;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * Settings > Trash: whether deleted files and schedules are kept for a while, and for how long.
 */
class TrashController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private SettingsRepositoryInterface $settings)
    {
    }

    public function index(): View
    {
        return view('admin.settings.trash', [
            'enabled' => (bool) config('trash.enabled'),
            'days' => (int) config('trash.retention_days', 30),
            'items' => ServerTrashItem::query()->count(),
            'bytes' => (int) ServerTrashItem::query()->sum('size'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate(['retention_days' => 'required|integer|between:1,365']);

        $this->settings->set('settings::trash:enabled', $request->boolean('enabled') ? 'true' : 'false');
        $this->settings->set('settings::trash:retention_days', (string) $data['retention_days']);

        $this->alert->success('Trash bin settings were saved.')->flash();

        return redirect()->route('admin.settings.trash');
    }
}

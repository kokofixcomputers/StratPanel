<?php

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Models\InstalledExtension;
use Pterodactyl\Extensions\ExtensionManager;
use Pterodactyl\Extensions\ExtensionSettings;
use Pterodactyl\Extensions\InvalidManifestException;
use Pterodactyl\Http\Controllers\Controller;

/**
 * The page where an admin sees the installed extensions, switches them on and off and sets them. Installing and removing is done
 * with artisan, see p:extension:install.
 */
class ExtensionsController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private ExtensionManager $extensions)
    {
    }

    public function index(): View
    {
        $items = $this->extensions->records(true)->map(function (InstalledExtension $record) {
            $manifest = $this->extensions->manifestOf($record->ext_id);

            return [
                'record' => $record,
                'manifest' => $manifest,
                'running' => $this->extensions->isRunning($record->ext_id),
                'failed' => $this->extensions->failed()[$record->ext_id] ?? null,
                'hasSettings' => $manifest !== null && count($manifest->settings()) > 0,
            ];
        });

        return view('admin.extensions.index', [
            'items' => $items,
            'safeMode' => !$this->extensions->enabled(),
        ]);
    }

    public function settings(string $extension): View|RedirectResponse
    {
        [$record, $manifest] = $this->find($extension);
        if ($manifest === null || count($manifest->settings()) === 0) {
            $this->alert->warning('This extension has no settings.')->flash();

            return redirect()->route('admin.extensions');
        }

        return view('admin.extensions.settings', [
            'record' => $record,
            'manifest' => $manifest,
            'current' => array_replace($manifest->defaults(), (array) $record->settings),
            'options' => fn (array $setting) => ExtensionSettings::options($setting),
        ]);
    }

    public function saveSettings(Request $request, string $extension): RedirectResponse
    {
        [$record, $manifest] = $this->find($extension);
        if ($manifest === null) {
            $this->alert->danger('The files of this extension cannot be read.')->flash();

            return redirect()->route('admin.extensions');
        }

        $request->validate(ExtensionSettings::rules($manifest));
        $record->forceFill([
            'settings' => ExtensionSettings::normalize($manifest, (array) $request->input('settings', []), array_replace($manifest->defaults(), (array) $record->settings)),
        ])->save();

        $this->alert->success($manifest->name() . ' was set.')->flash();

        return redirect()->route('admin.extensions.settings', $extension);
    }

    public function toggle(string $extension): RedirectResponse
    {
        [$record, $manifest] = $this->find($extension);

        if (!$record->enabled) {
            // An extension whose files are broken is not switched on, that would only show a problem on every page.
            if ($manifest === null) {
                $this->alert->danger($record->name . ' cannot be switched on: its files are missing or extension.json is not valid. Install it again.')->flash();

                return redirect()->route('admin.extensions');
            }
            $record->forceFill(['enabled' => true, 'last_error' => null, 'last_error_at' => null])->save();
            $this->alert->success($manifest->name() . ' is on.')->flash();
        } else {
            $record->forceFill(['enabled' => false])->save();
            $this->alert->success($record->name . ' is off.')->flash();
        }

        return redirect()->route('admin.extensions');
    }

    public function clearError(string $extension): RedirectResponse
    {
        [$record] = $this->find($extension);
        $record->forceFill(['last_error' => null, 'last_error_at' => null])->save();

        return redirect()->route('admin.extensions');
    }

    /** @return array{0: InstalledExtension, 1: \Pterodactyl\Extensions\Manifest|null} */
    private function find(string $extension): array
    {
        $record = InstalledExtension::query()->where('ext_id', $extension)->firstOrFail();

        return [$record, $this->extensions->manifestOf($extension)];
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Extensions\Manifest;
use Pterodactyl\Models\InstalledExtension;
use Pterodactyl\Extensions\ExtensionManager;
use Pterodactyl\Extensions\ExtensionSettings;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;

/**
 * The extensions for the admin pages: what is installed, switching them on and off, and their settings. Installing and removing is done
 * with artisan, see p:extension:install.
 */
class ExtensionsController extends Controller
{
    public function __construct(private ExtensionManager $extensions)
    {
    }

    public function index(): JsonResponse
    {
        $failed = $this->extensions->failed();

        return new JsonResponse([
            'safe_mode' => !$this->extensions->enabled(),
            'extensions' => $this->extensions->records(true)->map(function (InstalledExtension $record) use ($failed) {
                $manifest = $this->extensions->manifestOf($record->ext_id);

                return [
                    'id' => $record->ext_id,
                    'name' => $record->name,
                    'version' => $record->version,
                    'author' => $manifest?->author() ?: null,
                    'description' => $manifest?->description(),
                    'broken' => $manifest === null,
                    'enabled' => (bool) $record->enabled,
                    'running' => $this->extensions->isRunning($record->ext_id),
                    'failed' => isset($failed[$record->ext_id]),
                    'last_error' => $record->last_error,
                    'last_error_at' => $record->last_error_at?->toIso8601String(),
                    'has_settings' => $manifest !== null && count($manifest->settings()) > 0,
                ];
            })->values()->all(),
        ]);
    }

    /** The declaration of the settings and what they are now. Passwords are never sent back, only whether one is saved. */
    public function settings(string $extension): JsonResponse
    {
        [$record, $manifest] = $this->find($extension);
        if ($manifest === null || count($manifest->settings()) === 0) {
            throw new DisplayException('This extension has no settings.');
        }

        $current = array_replace($manifest->defaults(), (array) $record->settings);

        return new JsonResponse([
            'id' => $record->ext_id,
            'name' => $manifest->name(),
            'version' => $manifest->version(),
            'author' => $manifest->author() !== '' ? $manifest->author() : null,
            'homepage' => $manifest->homepage() ?: null,
            'enabled' => (bool) $record->enabled,
            'settings' => array_map(fn (array $setting) => array_merge($setting, [
                'options' => $setting['type'] === 'select' ? ExtensionSettings::options($setting) : null,
                'saved' => $setting['type'] === 'password' ? ($current[$setting['key']] ?? '') !== '' : null,
            ]), $manifest->settings()),
            'values' => collect($manifest->settings())->mapWithKeys(fn (array $setting) => [
                $setting['key'] => $setting['type'] === 'password' ? '' : ($current[$setting['key']] ?? ''),
            ])->all(),
        ]);
    }

    public function saveSettings(Request $request, string $extension): JsonResponse
    {
        [$record, $manifest] = $this->find($extension);
        if ($manifest === null) {
            throw new DisplayException('The files of this extension cannot be read.');
        }

        $request->validate(ExtensionSettings::rules($manifest));
        $record->forceFill([
            'settings' => ExtensionSettings::normalize($manifest, (array) $request->input('settings', []), array_replace($manifest->defaults(), (array) $record->settings)),
        ])->save();

        return new JsonResponse(['saved' => true]);
    }

    public function toggle(string $extension): JsonResponse
    {
        [$record, $manifest] = $this->find($extension);

        if (!$record->enabled) {
            // An extension whose files are broken is not switched on, that would only show a problem on every page.
            if ($manifest === null) {
                throw new DisplayException($record->name . ' cannot be switched on: its files are missing or extension.json is not valid. Install it again.');
            }
            $record->forceFill(['enabled' => true, 'last_error' => null, 'last_error_at' => null])->save();
        } else {
            $record->forceFill(['enabled' => false])->save();
        }

        return new JsonResponse(['enabled' => (bool) $record->enabled]);
    }

    public function clearError(string $extension): JsonResponse
    {
        [$record] = $this->find($extension);
        $record->forceFill(['last_error' => null, 'last_error_at' => null])->save();

        return new JsonResponse([], 204);
    }

    /** @return array{0: InstalledExtension, 1: Manifest|null} */
    private function find(string $extension): array
    {
        $record = InstalledExtension::query()->where('ext_id', $extension)->firstOrFail();

        return [$record, $this->extensions->manifestOf($extension)];
    }
}

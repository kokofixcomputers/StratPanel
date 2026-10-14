<?php

namespace Pterodactyl\Services\Updates;

use Illuminate\Support\Facades\Http;
use Illuminate\Contracts\Cache\Repository as CacheRepository;

/**
 * Finds out whether GitHub has a newer panel-ui.tar.gz than the interface that is installed, for the notice in the
 * admin area. It only looks, php artisan p:update-ui is what installs it (see UpdateUiCommand).
 */
class UiUpdateChecker
{
    public const REPOSITORY = 'kokofixcomputers/StratPanel';

    // The interface archive is preferred, a release without it has the archive of the whole panel (see UpdateUiCommand).
    public const ASSETS = ['panel-ui.tar.gz', 'panel.tar.gz'];

    private const CACHE_KEY = 'stratpanel:ui-update';

    // A build is published a few minutes after the files in it were made, anything further apart is a newer build.
    private const BUILD_MARGIN = 900;

    public function __construct(private CacheRepository $cache)
    {
    }

    /**
     * What to show in the admin area, or null when there is nothing newer (or it could not be found out). GitHub is asked
     * at most every few hours, and again sooner after a failure so a short outage does not hide the notice for long.
     *
     * @return array{tag: string, name: string, channel: string, published: string, command: string}|null
     */
    public function available(): ?array
    {
        $cached = $this->cache->get(self::CACHE_KEY);
        if (is_array($cached) && array_key_exists('update', $cached)) {
            return $cached['update'];
        }

        try {
            $update = $this->check();
            $ttl = 6 * 3600;
        } catch (\Throwable) {
            $update = null;
            $ttl = 1800;
        }

        // The result is wrapped, a cache cannot tell "nothing to show" from "not asked yet" for a bare null.
        $this->cache->put(self::CACHE_KEY, ['update' => $update], $ttl);

        return $update;
    }

    /**
     * @return array{tag: string, name: string, channel: string, published: string, command: string}|null
     */
    protected function check(): ?array
    {
        $installed = $this->installed();
        // Builds of every push are "canary", release builds carry their version.
        $channel = $installed['channel'] ?? (config('app.version') === 'canary' ? 'nightly' : 'release');

        $url = $channel === 'nightly'
            ? 'https://api.github.com/repos/' . self::REPOSITORY . '/releases/tags/nightly'
            : 'https://api.github.com/repos/' . self::REPOSITORY . '/releases/latest';

        $response = Http::withHeaders(['Accept' => 'application/vnd.github+json', 'User-Agent' => 'StratPanel-updater'])
            ->timeout(3)
            ->get($url);
        if (!$response->successful() || !is_array($response->json())) {
            return null;
        }

        $release = $response->json();
        $asset = null;
        foreach (self::ASSETS as $name) {
            $asset = collect($release['assets'] ?? [])->firstWhere('name', $name);
            if ($asset) {
                break;
            }
        }
        if (!$asset || !$this->isNewer($asset, $installed)) {
            return null;
        }

        return [
            'tag' => (string) ($release['tag_name'] ?? ''),
            'name' => (string) ($release['name'] ?? $release['tag_name'] ?? ''),
            'channel' => $channel,
            'published' => (string) ($asset['updated_at'] ?? $asset['created_at'] ?? ''),
            'command' => 'cd ' . base_path() . ' && sudo php artisan p:update-ui' . ($channel === 'nightly' ? ' --channel=nightly' : ''),
        ];
    }

    /**
     * An interface that was installed with p:update-ui is known exactly. One that came with the archive of the whole
     * panel is only known by when it was built, which is the age of its manifest.
     */
    protected function isNewer(array $asset, ?array $installed): bool
    {
        if ($installed && ($installed['repository'] ?? null) === self::REPOSITORY && isset($installed['asset_id'])) {
            return (string) $installed['asset_id'] !== (string) $asset['id'];
        }

        $manifest = public_path('assets/manifest.json');
        $published = strtotime((string) ($asset['created_at'] ?? $asset['updated_at'] ?? ''));
        if (!is_file($manifest) || !$published) {
            return false;
        }

        return $published - filemtime($manifest) > self::BUILD_MARGIN;
    }

    /** What p:update-ui wrote when it last installed an interface. */
    protected function installed(): ?array
    {
        $file = storage_path('app/ui-version.json');
        if (!is_file($file)) {
            return null;
        }

        $data = json_decode((string) file_get_contents($file), true);

        return is_array($data) ? $data : null;
    }
}

<?php

namespace Pterodactyl\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Process\Process;

/**
 * Brings the web interface up to date without touching anything else: it fetches panel-ui.tar.gz of the newest build
 * from GitHub, checks it and swaps the interface folders in public/ for the new ones. The PHP code, the database and
 * the settings are not part of it, a new panel.tar.gz and p:upgrade are still what updates those.
 *
 * It is a command and not something a button in the panel runs: replacing files needs the rights of whoever runs it,
 * and a web request that can rewrite the panel's own files is a risk that is not worth it.
 */
class UpdateUiCommand extends Command
{
    protected const REPOSITORY = 'kokofixcomputers/StratPanel';

    // The archive with just the interface is preferred. A release that was made before it existed only has the one of the
    // whole panel, the interface folders are taken out of that.
    protected const ASSETS = ['panel-ui.tar.gz', 'panel.tar.gz'];

    // The folders of public/ that the archive replaces, and the only places it may write to.
    protected const DIRECTORIES = ['assets', 'themes', 'helper', 'tools'];

    protected const KEEP_BACKUPS = 3;

    protected $signature = 'p:update-ui
        {--check : Only say whether a newer interface is available, nothing is changed.}
        {--force : Install it even when it is the build that is installed already.}
        {--channel=release : "release" for the newest release, "nightly" for the build of the latest push.}
        {--repo= : The GitHub repository to take it from, as owner/name.}
        {--rollback : Put the interface that was there before the last update back.}';

    protected $description = 'Downloads the newest panel-ui.tar.gz from GitHub and replaces the web interface with it.';

    public function handle(): int
    {
        if ($this->option('rollback')) {
            return $this->rollback();
        }

        $repo = $this->option('repo') ?: self::REPOSITORY;
        $channel = $this->option('channel');
        if (!preg_match('#^[\w.-]+/[\w.-]+$#', $repo) || !in_array($channel, ['release', 'nightly'], true)) {
            $this->error('The repository must look like owner/name and the channel must be "release" or "nightly".');

            return 1;
        }

        $release = $this->findRelease($repo, $channel);
        if (is_null($release)) {
            return 1;
        }

        $asset = $this->pickAsset($release);
        if (!$asset) {
            $this->error('The ' . $release['tag_name'] . ' release of ' . $repo . ' has neither ' . implode(' nor ', self::ASSETS) . '.');

            return 1;
        }
        if ($asset['name'] !== self::ASSETS[0]) {
            $this->warn('This release has no ' . self::ASSETS[0] . ', the interface is taken out of ' . $asset['name'] . ' (' . $this->size($asset['size'] ?? 0) . ').');
        }

        $installed = $this->installed();
        $current = $installed
            && ($installed['repository'] ?? null) === $repo
            && (string) ($installed['asset_id'] ?? '') === (string) $asset['id'];

        $this->line('Installed: ' . ($installed ? ($installed['tag'] ?? '?') . ' (' . ($installed['installed_at'] ?? '?') . ')' : 'unknown'));
        $this->line('Available: ' . $release['tag_name'] . ' (' . ($asset['updated_at'] ?? '?') . ', ' . $this->size($asset['size'] ?? 0) . ')');

        if ($current && !$this->option('force')) {
            $this->info('The interface is up to date.');

            return 0;
        }

        if ($this->option('check')) {
            $this->warn('A newer interface is available. Run "php artisan p:update-ui" to install it.');

            return 0;
        }

        $stage = storage_path('app/ui-update-' . bin2hex(random_bytes(4)));
        File::ensureDirectoryExists($stage);

        try {
            $this->install($asset, $stage);
            $this->writeInstalled([
                'repository' => $repo,
                'channel' => $channel,
                'tag' => $release['tag_name'],
                'asset_id' => $asset['id'],
                'installed_at' => date('c'),
            ]);
        } catch (\Throwable $exception) {
            $this->error($exception->getMessage());

            return 1;
        } finally {
            File::deleteDirectory($stage);
        }

        $this->call('view:clear');
        $this->info('The interface is now ' . $release['tag_name'] . '. Reload the panel in the browser (hard refresh) to see it.');

        return 0;
    }

    /**
     * The archive of a release to install from, the first of ASSETS that it has.
     */
    protected function pickAsset(array $release): ?array
    {
        foreach (self::ASSETS as $name) {
            $asset = collect($release['assets'] ?? [])->firstWhere('name', $name);
            if ($asset) {
                return $asset;
            }
        }

        return null;
    }

    /**
     * The release to take the archive from. "latest" on GitHub skips pre-releases, which is what nightly builds are.
     */
    protected function findRelease(string $repo, string $channel): ?array
    {
        $url = $channel === 'nightly'
            ? "https://api.github.com/repos/{$repo}/releases/tags/nightly"
            : "https://api.github.com/repos/{$repo}/releases/latest";

        try {
            $response = Http::withHeaders($this->headers())->timeout(20)->get($url);
        } catch (\Throwable $exception) {
            $this->error('GitHub could not be reached: ' . $exception->getMessage());

            return null;
        }

        if ($response->status() === 404) {
            $this->error($channel === 'nightly'
                ? "{$repo} has no nightly build."
                : "{$repo} has no release yet. Try --channel=nightly for the build of the latest push.");

            return null;
        }
        if ($response->status() === 403 || $response->status() === 429) {
            $this->error('GitHub refused the request, most likely the rate limit for requests without a login was reached. Try again in an hour.');

            return null;
        }
        if (!$response->successful() || !is_array($response->json())) {
            $this->error('GitHub answered with an error (' . $response->status() . ').');

            return null;
        }

        return $response->json();
    }

    /**
     * Downloads, checks and unpacks the archive into the stage folder and swaps it into public/. What was there is kept
     * in storage/app/ui-backup so it can be put back with --rollback.
     */
    protected function install(array $asset, string $stage): void
    {
        $archive = $stage . '/' . $asset['name'];

        $this->line('Downloading ' . $asset['name'] . '...');
        $response = Http::withHeaders($this->headers())
            ->timeout(600)
            ->withOptions(['sink' => $archive])
            ->get($asset['browser_download_url']);
        if (!$response->successful() || !is_file($archive)) {
            throw new \RuntimeException('The download failed (' . $response->status() . ').');
        }

        if (isset($asset['size']) && filesize($archive) !== (int) $asset['size']) {
            throw new \RuntimeException('The download is not the size GitHub lists, it is incomplete.');
        }

        // GitHub lists a checksum for the assets it hosts.
        if (preg_match('/^sha256:([0-9a-f]{64})$/i', (string) ($asset['digest'] ?? ''), $match)) {
            if (!hash_equals(strtolower($match[1]), hash_file('sha256', $archive))) {
                throw new \RuntimeException('The checksum of the download does not match the one GitHub lists. Nothing was changed.');
            }
            $this->line('Checksum matches.');
        } else {
            $this->warn('GitHub lists no checksum for this file, it could not be verified.');
        }

        // The interface archive may only hold the interface folders. From the archive of the whole panel only those folders
        // are taken, whatever else is in it is never unpacked.
        $whole = $asset['name'] !== self::ASSETS[0];
        if (!$whole) {
            $this->checkEntries($archive);
        }

        $extracted = $stage . '/extracted';
        File::ensureDirectoryExists($extracted);
        $paths = $whole ? $this->interfacePaths($archive) : [];
        $this->runProcess(
            array_merge(['tar', '-xzf', $archive, '-C', $extracted, '--no-same-owner'], $paths),
            'The archive could not be unpacked.'
        );

        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($extracted, \FilesystemIterator::SKIP_DOTS)) as $file) {
            if ($file->isLink()) {
                throw new \RuntimeException('The archive contains a link, which it should not. Nothing was changed.');
            }
        }
        if (!is_file($extracted . '/public/assets/manifest.json')) {
            throw new \RuntimeException('The archive does not look like a panel interface (public/assets/manifest.json is missing).');
        }

        $this->swap($extracted);
    }

    /**
     * The interface folders that are in the archive of the whole panel, as tar spells them. An older release may not have
     * all of them (the tools and the helper plugin came later), and tar refuses to unpack a path that is not there.
     *
     * @return string[]
     */
    protected function interfacePaths(string $archive): array
    {
        $process = new Process(['tar', '-tzf', $archive]);
        $process->setTimeout(300);
        $process->run();
        if (!$process->isSuccessful()) {
            throw new \RuntimeException('The archive could not be read.');
        }

        $entries = array_filter(explode("\n", $process->getOutput()));
        // Some archives start every name with "./".
        $prefix = str_starts_with((string) reset($entries), './') ? './' : '';

        $paths = [];
        foreach (self::DIRECTORIES as $directory) {
            foreach ($entries as $entry) {
                if (str_starts_with($entry, "{$prefix}public/{$directory}/")) {
                    $paths[] = "{$prefix}public/{$directory}";
                    break;
                }
            }
        }

        if (!in_array("{$prefix}public/assets", $paths, true)) {
            throw new \RuntimeException('The archive has no public/assets, it does not look like a panel.');
        }

        return $paths;
    }

    /**
     * Only the interface folders may be in the archive, and nothing may reach outside of them.
     */
    protected function checkEntries(string $archive): void
    {
        $process = new Process(['tar', '-tzf', $archive]);
        $process->setTimeout(120);
        $process->run();
        if (!$process->isSuccessful()) {
            throw new \RuntimeException('The archive could not be read.');
        }

        $allowed = '#^public/(' . implode('|', self::DIRECTORIES) . ')(/|$)#';
        foreach (array_filter(explode("\n", $process->getOutput())) as $entry) {
            if (!preg_match($allowed, $entry) || in_array('..', explode('/', $entry), true) || str_starts_with($entry, '/')) {
                throw new \RuntimeException("The archive has a file where it should not: {$entry}. Nothing was changed.");
            }
        }
    }

    protected function swap(string $extracted): void
    {
        $backup = storage_path('app/ui-backup/' . date('Ymd-His'));
        File::ensureDirectoryExists($backup);

        $replaced = [];
        try {
            foreach (self::DIRECTORIES as $directory) {
                $new = "{$extracted}/public/{$directory}";
                if (!is_dir($new)) {
                    continue;
                }

                $live = public_path($directory);
                if (is_dir($live)) {
                    if (!File::moveDirectory($live, "{$backup}/{$directory}")) {
                        throw new \RuntimeException("Could not move public/{$directory} out of the way.");
                    }
                    $replaced[] = $directory;
                }
                if (!File::moveDirectory($new, $live)) {
                    throw new \RuntimeException("Could not put the new public/{$directory} in place.");
                }
            }
        } catch (\Throwable $exception) {
            // Whatever was swapped already goes back, so the panel is never left with half of an interface.
            foreach ($replaced as $directory) {
                File::deleteDirectory(public_path($directory));
                File::moveDirectory("{$backup}/{$directory}", public_path($directory));
            }

            throw new \RuntimeException($exception->getMessage() . ' The previous interface was put back.');
        }

        $this->fixOwner();
        $this->pruneBackups();
    }

    /**
     * Run as root, the new files would belong to root and the web server might not be able to read them. They get the
     * owner of public/ then.
     */
    protected function fixOwner(): void
    {
        if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) {
            return;
        }

        $user = posix_getpwuid(fileowner(public_path()))['name'] ?? null;
        $group = posix_getgrgid(filegroup(public_path()))['name'] ?? null;
        if (!$user || !$group) {
            return;
        }

        foreach (self::DIRECTORIES as $directory) {
            if (is_dir(public_path($directory))) {
                (new Process(['chown', '-R', "{$user}:{$group}", public_path($directory)]))->run();
            }
        }
    }

    protected function pruneBackups(): void
    {
        $backups = glob(storage_path('app/ui-backup/*'), GLOB_ONLYDIR) ?: [];
        sort($backups);

        foreach (array_slice($backups, 0, max(0, count($backups) - self::KEEP_BACKUPS)) as $old) {
            File::deleteDirectory($old);
        }
    }

    protected function rollback(): int
    {
        $backups = glob(storage_path('app/ui-backup/*'), GLOB_ONLYDIR) ?: [];
        sort($backups);
        $latest = end($backups);
        if (!$latest) {
            $this->error('There is no previous interface to go back to.');

            return 1;
        }

        foreach (self::DIRECTORIES as $directory) {
            if (is_dir("{$latest}/{$directory}")) {
                File::deleteDirectory(public_path($directory));
                File::moveDirectory("{$latest}/{$directory}", public_path($directory));
            }
        }
        File::deleteDirectory($latest);
        $this->fixOwner();
        // What is installed now is not known any more, the next update installs whatever is newest.
        @unlink($this->versionFile());

        $this->call('view:clear');
        $this->info('The previous interface is back. Reload the panel in the browser (hard refresh).');

        return 0;
    }

    protected function runProcess(array $command, string $failure): void
    {
        $process = new Process($command);
        $process->setTimeout(600);
        $process->run();
        if (!$process->isSuccessful()) {
            throw new \RuntimeException($failure . ' ' . trim($process->getErrorOutput()));
        }
    }

    protected function headers(): array
    {
        return ['Accept' => 'application/vnd.github+json', 'User-Agent' => 'StratPanel-updater'];
    }

    protected function versionFile(): string
    {
        return storage_path('app/ui-version.json');
    }

    protected function installed(): ?array
    {
        if (!is_file($this->versionFile())) {
            return null;
        }

        $data = json_decode((string) file_get_contents($this->versionFile()), true);

        return is_array($data) ? $data : null;
    }

    protected function writeInstalled(array $data): void
    {
        file_put_contents($this->versionFile(), json_encode($data, JSON_PRETTY_PRINT) . "\n");
    }

    protected function size(int $bytes): string
    {
        return $bytes >= 1048576 ? round($bytes / 1048576, 1) . ' MB' : round($bytes / 1024) . ' KB';
    }
}

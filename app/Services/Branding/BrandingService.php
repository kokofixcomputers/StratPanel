<?php

namespace Pterodactyl\Services\Branding;

use Illuminate\Support\Str;
use Illuminate\Http\UploadedFile;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * The branding an admin can set on top of the panel name: a favicon, announcements shown on the dashboard and custom
 * links. All of it is stored as plain keys of the settings table, the lists as JSON, so it needs no migration.
 */
class BrandingService
{
    public const FAVICON = 'settings::branding:favicon';

    public const ANNOUNCEMENTS = 'settings::branding:announcements';

    public const LINKS = 'settings::branding:links';

    public const SEO = 'settings::branding:seo';

    /** What search and sharing say about the panel, an empty value keeps the default (the name of the panel). */
    public const SEO_DEFAULTS = [
        'title' => '',
        'description' => '',
        'share_image' => '',
        'theme_color' => '',
        'app_name' => '',
        'app_short_name' => '',
        // Whether search engines may list the pages that are public (the sign in page).
        'index' => false,
    ];

    /** Where links can be shown, and what an admin sees for each. */
    public const LOCATIONS = [
        'sidebar' => 'Server sidebar',
        'navbar' => 'Top bar',
        'footer' => 'Footer',
    ];

    public const TYPES = ['info', 'success', 'warning', 'danger'];

    /** The folder, inside public, uploaded favicons are put in. */
    private const DIRECTORY = 'branding';

    /** @var array<string, array<string, mixed>> */
    private array $payload = [];

    public function __construct(private SettingsRepositoryInterface $settings)
    {
    }

    /** The address of the uploaded favicon, null when the default ones are in use. */
    public function favicon(): ?string
    {
        $file = (string) $this->settings->get(self::FAVICON, '');

        return $file !== '' && is_file(public_path(self::DIRECTORY . '/' . $file))
            ? '/' . self::DIRECTORY . '/' . $file
            : null;
    }

    /**
     * Stores an uploaded image as the favicon and removes the one before it. The name has the content hash in it, so a
     * changed favicon is not hidden by the cache of a browser.
     */
    public function setFavicon(UploadedFile $file): void
    {
        $name = 'favicon-' . substr(sha1_file($file->getRealPath()), 0, 12) . '.' . $this->extension($file);
        $previous = (string) $this->settings->get(self::FAVICON, '');
        $file->move(public_path(self::DIRECTORY), $name);
        $this->settings->set(self::FAVICON, $name);
        $this->payload = [];

        // The same picture uploaded again has the same name, which is not to be deleted.
        if ($previous !== '' && $previous !== $name && basename($previous) === $previous) {
            @unlink(public_path(self::DIRECTORY . '/' . $previous));
        }
    }

    private function extension(UploadedFile $file): string
    {
        $allowed = ['png', 'ico', 'gif', 'jpg', 'jpeg'];

        // Only these are ever written to the public folder. The content decides, the name is the fallback because the
        // type of an icon file is often not recognised.
        foreach ([$file->guessExtension(), $file->getClientOriginalExtension()] as $candidate) {
            if (in_array(strtolower((string) $candidate), $allowed, true)) {
                return strtolower((string) $candidate);
            }
        }

        return 'png';
    }

    public function removeFavicon(): void
    {
        $current = (string) $this->settings->get(self::FAVICON, '');
        if ($current !== '' && basename($current) === $current) {
            @unlink(public_path(self::DIRECTORY . '/' . $current));
        }
        $this->settings->forget(self::FAVICON);
        $this->payload = [];
    }

    /**
     * The settings for search engines and for what a shared link and an installed app show.
     *
     * @return array{title: string, description: string, share_image: string, theme_color: string, app_name: string, app_short_name: string, index: bool}
     */
    public function seo(): array
    {
        $stored = json_decode((string) $this->settings->get(self::SEO, '{}'), true);
        $stored = is_array($stored) ? $stored : [];
        $seo = [];
        foreach (self::SEO_DEFAULTS as $key => $default) {
            $value = $stored[$key] ?? $default;
            $seo[$key] = is_bool($default) ? (bool) $value : (is_string($value) ? trim($value) : $default);
        }

        return $seo;
    }

    /** @param array<string, mixed> $seo */
    public function saveSeo(array $seo): void
    {
        $clean = [];
        foreach (self::SEO_DEFAULTS as $key => $default) {
            $value = $seo[$key] ?? $default;
            $clean[$key] = is_bool($default) ? (bool) $value : trim((string) $value);
        }
        $this->payload = [];
        $this->settings->set(self::SEO, json_encode($clean, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    /** @return array<int, array{id: string, title: string, message: string, type: string, enabled: bool, dismissible: bool, link_label: string, link_url: string}> */
    public function announcements(): array
    {
        return array_map(fn (array $item) => [
            'id' => (string) ($item['id'] ?? ''),
            'title' => (string) ($item['title'] ?? ''),
            'message' => (string) ($item['message'] ?? ''),
            'type' => in_array($item['type'] ?? '', self::TYPES, true) ? $item['type'] : 'info',
            'enabled' => (bool) ($item['enabled'] ?? true),
            'dismissible' => (bool) ($item['dismissible'] ?? true),
            'link_label' => (string) ($item['link_label'] ?? ''),
            'link_url' => (string) ($item['link_url'] ?? ''),
        ], $this->list(self::ANNOUNCEMENTS));
    }

    /** @return array<int, array{label: string, url: string, location: string, new_tab: bool}> */
    public function links(): array
    {
        return array_map(fn (array $item) => [
            'label' => (string) ($item['label'] ?? ''),
            'url' => (string) ($item['url'] ?? ''),
            'location' => array_key_exists($item['location'] ?? '', self::LOCATIONS) ? $item['location'] : 'footer',
            'new_tab' => (bool) ($item['new_tab'] ?? true),
        ], $this->list(self::LINKS));
    }

    /** @param array<int, array<string, mixed>> $items */
    public function saveAnnouncements(array $items): void
    {
        $this->store(self::ANNOUNCEMENTS, array_map(fn (array $item) => [
            // An id that stays the same, so an announcement somebody dismissed does not come back after an edit of the
            // list. New rows get theirs here.
            'id' => preg_match('/^[a-z0-9]{6,32}$/', (string) ($item['id'] ?? '')) ? $item['id'] : Str::lower(Str::random(12)),
            'title' => trim((string) ($item['title'] ?? '')),
            'message' => trim((string) $item['message']),
            'type' => $item['type'],
            'enabled' => !empty($item['enabled']),
            'dismissible' => !empty($item['dismissible']),
            'link_label' => trim((string) ($item['link_label'] ?? '')),
            'link_url' => trim((string) ($item['link_url'] ?? '')),
        ], $items));
    }

    /** @param array<int, array<string, mixed>> $items */
    public function saveLinks(array $items): void
    {
        $this->store(self::LINKS, array_map(fn (array $item) => [
            'label' => trim((string) $item['label']),
            'url' => trim((string) $item['url']),
            'location' => $item['location'],
            'new_tab' => !empty($item['new_tab']),
        ], $items));
    }

    /**
     * What the frontend gets. Announcements and links are for people who are signed in, the sign in page only gets the
     * favicon.
     *
     * @return array<string, mixed>
     */
    public function toArray(bool $authenticated): array
    {
        // The view composer asks for this for every view and partial of a request, the answer is the same each time.
        return $this->payload[$authenticated ? 'user' : 'guest'] ??= $this->build($authenticated);
    }

    /** @return array<string, mixed> */
    private function build(bool $authenticated): array
    {
        $data = ['favicon' => $this->favicon(), 'announcements' => [], 'links' => []];
        if (!$authenticated) {
            return $data;
        }

        $data['announcements'] = array_values(array_map(
            fn (array $a) => array_merge($a, ['key' => $a['id'] . ':' . substr(md5($a['title'] . $a['message'] . $a['link_url']), 0, 8)]),
            array_filter($this->announcements(), fn (array $a) => $a['enabled'] && $a['message'] !== '')
        ));
        $data['links'] = array_values(array_filter($this->links(), fn (array $l) => $l['label'] !== '' && $l['url'] !== ''));

        return $data;
    }

    /** @return array<int, array<string, mixed>> */
    private function list(string $key): array
    {
        $decoded = json_decode((string) $this->settings->get($key, '[]'), true);

        return is_array($decoded) ? array_values(array_filter($decoded, 'is_array')) : [];
    }

    /** @param array<int, array<string, mixed>> $items */
    private function store(string $key, array $items): void
    {
        $this->payload = [];
        $this->settings->set($key, json_encode(array_values($items), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }
}

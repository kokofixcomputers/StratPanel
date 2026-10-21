<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Pterodactyl\Models\Egg;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Theme\ThemeService;
use Pterodactyl\Services\Branding\BrandingService;

/** The theme editor's side of the panel. Seeing and changing the theme is the permission of the branding settings. */
class ThemeController extends ClientApiController
{
    public function __construct(private ThemeService $theme, private BrandingService $branding)
    {
        parent::__construct();
    }

    public function show(): JsonResponse
    {
        return new JsonResponse(['config' => $this->theme->config(), 'css' => $this->theme->css()]);
    }

    /**
     * Checks the settings of a look (`config`) the way every place that keeps one needs, and returns what was sent. $extra are rules of
     * the request around it.
     *
     * @param array<string, mixed> $extra
     *
     * @return array<string, mixed>
     */
    private function validateConfig(Request $request, array $extra = []): array
    {
        $hex = ['regex:/^#[0-9a-fA-F]{6}$/'];
        $nullableHex = ['nullable', 'string', ...$hex];
        $surface = [];
        foreach (['light', 'dark'] as $mode) {
            foreach (['page', 'card', 'border', 'text', 'muted'] as $part) {
                $surface["config.surface.$mode.$part"] = $nullableHex;
            }
        }
        $url = ['required', 'string', 'max:300', 'regex:#^(/(?!/)|https?://)[^\s<>"\']*$#'];

        $sidebars = [];
        foreach (['server', 'dashboard', 'account'] as $bar) {
            $sidebars["config.sidebars.$bar.categories"] = 'present|array|max:12';
            $sidebars["config.sidebars.$bar.categories.*.id"] = ['required', 'string', 'regex:/^[a-z0-9]{3,20}$/'];
            $sidebars["config.sidebars.$bar.categories.*.title"] = 'required|string|min:1|max:30';
            $sidebars["config.sidebars.$bar.categories.*.items"] = 'present|array|max:40';
            $sidebars["config.sidebars.$bar.categories.*.items.*"] = ['string', 'max:60', 'regex:#^[A-Za-z0-9/:_-]+$#'];
            $sidebars["config.sidebars.$bar.hidden"] = 'present|array|max:80';
            $sidebars["config.sidebars.$bar.hidden.*"] = ['string', 'max:60', 'regex:#^[A-Za-z0-9/_-]+$#'];
            $sidebars["config.sidebars.$bar.extra"] = 'present|array|max:30';
            $sidebars["config.sidebars.$bar.extra.*.id"] = ['required', 'string', 'regex:/^[a-z0-9]{4,20}$/'];
            $sidebars["config.sidebars.$bar.extra.*.label"] = 'required|string|min:1|max:40';
            $sidebars["config.sidebars.$bar.extra.*.url"] = $url;
            $sidebars["config.sidebars.$bar.extra.*.newTab"] = 'required|boolean';
        }
        $sidebars['config.sidebars.dashboard.enabled'] = 'required|boolean';

        $data = $request->validate(array_merge($extra, [
            'config' => 'required|array',
            'config.accent' => ['required', 'string', ...$hex],
            'config.secondary' => ['nullable', 'string', ...$hex],
            'config.mode' => ['required', Rule::in(['system', 'light', 'dark'])],
            'config.radius' => ['required', Rule::in(['sharp', 'soft', 'round', 'pill'])],
            'config.buttons' => ['required', Rule::in(['default', 'pill', 'square'])],
            'config.shadow' => ['required', Rule::in(['none', 'soft', 'strong'])],
            'config.density' => ['required', Rule::in(['comfortable', 'compact'])],
            'config.font' => ['required', Rule::in(['inter', 'system', 'serif', 'mono'])],
            'config.layout' => ['required', Rule::in(['list', 'grid'])],
            'config.columns' => ['required', Rule::in([2, 3])],
            'config.glass' => 'required|integer|between:0,70',
            'config.glassBlur' => 'required|integer|between:0,30',
            'config.background' => 'required|array',
            'config.background.image' => 'nullable|string|max:500',
            'config.background.blur' => 'required|integer|between:0,40',
            'config.background.dim' => 'required|integer|between:0,90',
            'config.preset' => 'nullable|string|max:40',
            'config.chrome' => ['required', Rule::in(['attached', 'floating'])],
            'config.nav' => ['required', Rule::in(['tint', 'solid', 'line'])],
            'config.material' => ['required', Rule::in(['frosted', 'subtle', 'custom', 'off'])],
            'config.status.success' => $nullableHex,
            'config.status.danger' => $nullableHex,
            'config.status.warning' => $nullableHex,
            ...$surface,
            ...$sidebars,
            'config.radiusCustom' => 'nullable|integer|between:0,40',
            'config.fontScale' => 'required|integer|between:85,125',
            'config.console.style' => ['required', Rule::in(['match', 'dark'])],
            'config.console.brightness' => 'required|integer|between:30,100',
            'config.console.fontSize' => 'required|integer|between:10,20',
            'config.row.metrics' => 'present|array|max:6',
            'config.row.metrics.*' => ['distinct', Rule::in(['players', 'cpu', 'memory', 'disk', 'uptime', 'network'])],
            'config.row.address' => 'required|boolean',
            'config.row.description' => 'required|boolean',
            'config.row.size' => ['required', Rule::in(['small', 'medium', 'large'])],
            'config.row.metricStyle' => ['required', Rule::in(['bars', 'tiles', 'rings', 'chips'])],
            'config.row.status' => ['required', Rule::in(['bar', 'dot', 'none'])],
            'config.headingWeight' => ['required', Rule::in([500, 600, 700, 800])],
            'config.tracking' => ['required', Rule::in(['tight', 'normal', 'wide'])],
            'config.login.layout' => ['required', Rule::in(['card', 'brand', 'split', 'showcase'])],
            'config.login.side' => ['required', Rule::in(['left', 'right'])],
            'config.login.background' => ['required', Rule::in(['none', 'gradient', 'image', 'scan', 'squares', 'eggs'])],
            'config.login.gradient' => ['required', 'string', 'regex:/^[a-z]{1,20}$/'],
            'config.login.image' => 'nullable|string|max:500',
            'config.login.blur' => 'required|integer|between:0,40',
            'config.login.dim' => 'required|integer|between:0,90',
            'config.login.title' => 'nullable|string|max:60',
            'config.login.tagline' => 'nullable|string|max:160',
            'config.login.features' => 'present|array|max:4',
            'config.login.features.*' => 'string|max:50',
            'config.customGradient.angle' => 'required|integer|between:0,360',
            'config.customGradient.light' => 'required|array|min:2|max:3',
            'config.customGradient.light.*' => ['required', 'string', ...$hex],
            'config.customGradient.dark' => 'required|array|min:2|max:3',
            'config.customGradient.dark.*' => ['required', 'string', ...$hex],
            'config.folders.style' => ['required', Rule::in(['sections', 'chips', 'cards'])],
            'config.banners.dim' => 'required|integer|between:0,90',
            'config.banners.eggs' => 'present|array|max:80',
            'config.banners.eggs.*' => 'nullable|string|max:500',
            'config.banners.software' => 'present|array|max:20',
            'config.banners.software.*' => 'nullable|string|max:500',
            'config.powerDock' => ['required', Rule::in(['off', 'icons', 'labels'])],
            'config.buttonStyle' => ['required', Rule::in(['solid', 'soft', 'outline', 'gradient'])],
            'config.borders' => ['required', Rule::in(['subtle', 'none', 'strong'])],
            'config.pageWidth' => ['required', Rule::in(['narrow', 'normal', 'wide', 'full'])],
            'config.sidebarWidth' => ['required', Rule::in(['narrow', 'normal', 'wide'])],
            'config.sidebarFlat' => 'required|boolean',
            'config.motion.buttonHover' => ['required', Rule::in(['none', 'lift', 'glow', 'scale', 'shine'])],
            'config.motion.buttonPress' => ['required', Rule::in(['none', 'squish', 'sink'])],
            'config.motion.cardHover' => ['required', Rule::in(['none', 'lift', 'glow', 'border'])],
            'config.motion.speed' => ['required', Rule::in(['off', 'fast', 'normal', 'slow'])],
            'config.motion.page' => ['required', Rule::in(['fade', 'slide', 'none'])],
            'config.motion.pulse' => 'required|boolean',
        ]));

        if (!ThemeService::imageAllowed($data['config']['background']['image'] ?? null) || !ThemeService::imageAllowed($data['config']['login']['image'] ?? null)) {
            throw new DisplayException('That background picture address is not allowed, use an upload or an https address.');
        }

        // The banners are named by an egg (its number) or a software, and are pictures of this panel or of an https address.
        foreach (['eggs' => '/^[0-9]{1,9}$/', 'software' => '/^[A-Z]{3,12}$/'] as $kind => $keyPattern) {
            foreach ((array) ($data['config']['banners'][$kind] ?? []) as $key => $picture) {
                if (!preg_match($keyPattern, (string) $key) || !ThemeService::imageAllowed($picture)) {
                    throw new DisplayException('A banner has a name or a picture address that is not allowed.');
                }
            }
        }

        return $data;
    }

    public function update(Request $request): JsonResponse
    {
        $data = $this->validateConfig($request, [
            'css' => 'present|nullable|string|max:30000',
            'attributes' => 'sometimes|array|max:30',
        ]);

        try {
            $this->theme->save($data['config'], (string) ($data['css'] ?? ''), (array) ($data['attributes'] ?? []));
        } catch (\InvalidArgumentException $exception) {
            throw new DisplayException($exception->getMessage());
        }

        Activity::event('admin:theme.update')->log();

        return $this->show();
    }

    /** The looks saved under a name. */
    public function presets(): JsonResponse
    {
        return new JsonResponse($this->theme->presets());
    }

    /** Keeps the look that is being edited as a preset, or replaces the one with the id that is sent. */
    public function savePreset(Request $request): JsonResponse
    {
        $data = $this->validateConfig($request, [
            'id' => ['nullable', 'string', 'regex:/^[a-z0-9]{8}$/'],
            'name' => 'required|string|min:1|max:40',
        ]);

        try {
            $list = $this->theme->savePreset($data['id'] ?? null, $data['name'], $data['config']);
        } catch (\InvalidArgumentException $exception) {
            throw new DisplayException($exception->getMessage());
        }
        Activity::event('admin:theme.preset')->property('name', $data['name'])->log();

        return new JsonResponse($list);
    }

    public function renamePreset(Request $request, string $preset): JsonResponse
    {
        $data = $request->validate(['name' => 'required|string|min:1|max:40']);

        try {
            return new JsonResponse($this->theme->renamePreset($preset, $data['name']));
        } catch (\InvalidArgumentException $exception) {
            throw new DisplayException($exception->getMessage());
        }
    }

    public function deletePreset(string $preset): JsonResponse
    {
        return new JsonResponse($this->theme->deletePreset($preset));
    }

    /** The eggs of this panel, for the editor to pick a banner for each. */
    public function eggs(): JsonResponse
    {
        return new JsonResponse(
            Egg::query()->with('nest')->orderBy('name')->get()->map(fn (Egg $egg) => [
                'id' => $egg->id,
                'name' => $egg->name,
                'nest' => $egg->nest?->name,
            ])->all()
        );
    }

    public function destroy(): JsonResponse
    {
        $this->theme->reset();
        Activity::event('admin:theme.reset')->log();

        return new JsonResponse(['config' => null, 'css' => '']);
    }

    public function background(Request $request): JsonResponse
    {
        $request->validate(['image' => 'required|file|image|mimes:jpg,jpeg,png,webp,gif|max:8192']);

        return new JsonResponse(['url' => $this->theme->storeBackground($request->file('image'))]);
    }

    /** The favicon (the logo of the panel), the announcements and the custom links, which are branding rather than theme but live in the editor too. */
    public function branding(): JsonResponse
    {
        return new JsonResponse([
            'favicon' => $this->branding->favicon(),
            'announcements' => $this->branding->announcements(),
            'links' => $this->branding->links(),
            'seo' => $this->branding->seo(),
            'console_prompt' => $this->branding->consolePrompt(),
            'locations' => BrandingService::LOCATIONS,
            'types' => BrandingService::TYPES,
        ]);
    }

    /** Saves the announcements, or the links, or both: the list that is sent is the whole list, a row that is missing was deleted. */
    public function saveBranding(Request $request): JsonResponse
    {
        $link = ['nullable', 'string', 'max:500', 'regex:/^(https?:\/\/|\/(?!\/))\S+$/i'];
        $request->validate([
            'announcements' => 'sometimes|array|max:20',
            'announcements.*.id' => 'nullable|string|max:32',
            'announcements.*.title' => 'nullable|string|max:100',
            'announcements.*.message' => 'required|string|max:1000',
            'announcements.*.type' => ['required', Rule::in(BrandingService::TYPES)],
            'announcements.*.enabled' => 'nullable|boolean',
            'announcements.*.dismissible' => 'nullable|boolean',
            'announcements.*.link_label' => 'nullable|string|max:50',
            'announcements.*.link_url' => $link,
            'links' => 'sometimes|array|max:20',
            'links.*.label' => 'required|string|max:50',
            'links.*.url' => ['required', ...array_slice($link, 1)],
            'links.*.location' => ['required', Rule::in(array_keys(BrandingService::LOCATIONS))],
            'links.*.new_tab' => 'nullable|boolean',
            'console_prompt' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9@._~:\\- ]+$/'],
            'seo' => 'sometimes|array',
            'seo.title' => 'nullable|string|max:70',
            'seo.description' => 'nullable|string|max:200',
            'seo.share_image' => 'nullable|string|max:500',
            'seo.theme_color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'seo.app_name' => 'nullable|string|max:45',
            'seo.app_short_name' => 'nullable|string|max:12',
            'seo.index' => 'nullable|boolean',
        ]);

        if ($request->has('console_prompt')) {
            $this->branding->setConsolePrompt($request->input('console_prompt'));
        }

        if ($request->has('seo')) {
            if (!ThemeService::imageAllowed($request->input('seo.share_image'))) {
                throw new DisplayException('The share image has to be an upload or an https address.');
            }
            $this->branding->saveSeo((array) $request->input('seo'));
        }

        if ($request->has('announcements')) {
            $this->branding->saveAnnouncements((array) $request->input('announcements'));
        }
        if ($request->has('links')) {
            $this->branding->saveLinks((array) $request->input('links'));
        }
        Activity::event('admin:branding.update')->log();

        return $this->branding();
    }

    public function favicon(Request $request): JsonResponse
    {
        $request->validate(['favicon' => 'required|file|mimes:png,ico,gif,jpg,jpeg|max:512']);
        $this->branding->setFavicon($request->file('favicon'));
        Activity::event('admin:branding.update')->log();

        return $this->branding();
    }

    public function removeFavicon(): JsonResponse
    {
        $this->branding->removeFavicon();
        Activity::event('admin:branding.update')->log();

        return $this->branding();
    }
}

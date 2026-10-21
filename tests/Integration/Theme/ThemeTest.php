<?php

namespace Pterodactyl\Tests\Integration\Theme;

use Pterodactyl\Services\Theme\ThemeService;
use Pterodactyl\Services\Branding\BrandingService;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

class ThemeTest extends RoleTestCase
{
    public function setUp(): void
    {
        parent::setUp();

        // The settings are kept between tests, every test starts from the default look and the default search and sharing settings.
        app(ThemeService::class)->reset();
        app(BrandingService::class)->saveSeo([]);
        app(BrandingService::class)->setConsolePrompt(null);
        app(BrandingService::class)->saveLinkCards([]);
        app(\Pterodactyl\Contracts\Repository\SettingsRepositoryInterface::class)->forget(ThemeService::PRESETS);
    }

    private function config(array $changes = []): array
    {
        return array_replace_recursive([
            'accent' => '#0891b2', 'secondary' => null, 'mode' => 'dark', 'radius' => 'round', 'buttons' => 'pill', 'shadow' => 'soft',
            'density' => 'compact', 'font' => 'system', 'layout' => 'grid', 'columns' => 2, 'glass' => 30, 'glassBlur' => 10,
            'background' => ['image' => 'gradient:mist', 'blur' => 4, 'dim' => 10], 'preset' => null,
            'chrome' => 'floating', 'nav' => 'solid', 'material' => 'frosted',
            'status' => ['success' => '#0d9488', 'danger' => null, 'warning' => null],
            'surface' => [
                'light' => ['page' => '#fdf6e3', 'card' => null, 'border' => null, 'text' => null, 'muted' => null],
                'dark' => ['page' => null, 'card' => null, 'border' => null, 'text' => null, 'muted' => null],
            ],
            'radiusCustom' => 10, 'fontScale' => 105,
            'console' => ['style' => 'dark', 'brightness' => 80, 'fontSize' => 12],
            'row' => ['metrics' => ['cpu', 'uptime'], 'address' => true, 'description' => false, 'size' => 'tiny', 'metricStyle' => 'rings', 'status' => 'dot'],
            'customGradient' => ['angle' => 120, 'light' => ['#fdf6e3', '#f0e0c0'], 'dark' => ['#101010', '#202030', '#303040']],
            'folders' => ['style' => 'cards'],
            'banners' => ['eggs' => ['1' => '/branding/background-abcdef123456.jpg'], 'software' => ['PAPER' => 'https://img.example.com/paper.png'], 'dim' => 50],
            'powerDock' => 'labels',
            'headingWeight' => 700, 'tracking' => 'wide', 'buttonStyle' => 'soft', 'borders' => 'none', 'pageWidth' => 'wide',
            'sidebarWidth' => 'narrow', 'sidebarFlat' => true,
            'login' => [
                'layout' => 'brand', 'side' => 'left', 'background' => 'eggs', 'gradient' => 'mist', 'image' => null, 'blur' => 0, 'dim' => 30,
                'title' => 'Welcome to Koko Hosting', 'tagline' => 'Minecraft servers in a minute.', 'features' => ['Instant setup', 'Daily backups'],
            ],
            'motion' => ['buttonHover' => 'lift', 'buttonPress' => 'squish', 'cardHover' => 'glow', 'speed' => 'fast', 'page' => 'slide', 'pulse' => true],
            'sidebars' => [
                'server' => [
                    'categories' => [
                        ['id' => 'infra', 'title' => 'Infrastructure', 'items' => ['/files', 'extra:abcd1234']],
                        ['id' => 'misc', 'title' => 'Misc', 'items' => ['/']],
                    ],
                    'hidden' => ['/import'],
                    'extra' => [['id' => 'abcd1234', 'label' => 'Wiki', 'url' => 'https://wiki.example.com/{id}', 'newTab' => true]],
                ],
                'dashboard' => ['enabled' => true, 'categories' => [], 'hidden' => [], 'extra' => []],
                'account' => ['categories' => [], 'hidden' => ['/ssh'], 'extra' => []],
            ],
        ], $changes);
    }

    private function sample(): string
    {
        return trim(file_get_contents(base_path('tests/Fixtures/theme.css')));
    }

    public function testTheCssTheEditorMakesPassesTheCheck(): void
    {
        $service = app(ThemeService::class);

        $this->assertSame($this->sample(), $service->sanitize($this->sample()));
        $this->assertSame('', $service->sanitize(''));
    }

    public function testAnythingButVariablesIsRefused(): void
    {
        $service = app(ThemeService::class);

        foreach ([
            'html:root { color: red; }',
            'body { --x: 1; }',
            'html:root { --x: 1; } </style><script>alert(1)</script>',
            'html:root { --x: url("https://evil.example/a.png") no-repeat; }',
            'html:root { --x: url(javascript:alert(1)); }',
            'html:root { --x: expression(alert(1)); }',
            'html:root { --x: 1; } @import "x";',
            'html:root { --x: 1 } html.dark { --y: "; }',
            '/* hi */ html:root { --x: 1; }',
            'html:root { --x: \\31 ; }',
            'html:root { --x: a{b}; }',
        ] as $css) {
            $this->assertNull($service->sanitize($css), $css);
        }
    }

    public function testAPictureOfThisPanelOrAnHttpsAddressIsAllowed(): void
    {
        $service = app(ThemeService::class);

        $this->assertNotNull($service->sanitize('html:root { --bg-image: url("/branding/background-abc123.jpg"); }'));
        $this->assertNotNull($service->sanitize('html:root { --bg-image: url("https://images.example/a.png"); }'));
        $this->assertNull($service->sanitize('html:root { --bg-image: url("http://images.example/a.png"); }'));
        $this->assertNull($service->sanitize('html:root { --bg-image: url("/etc/passwd"); }'));
    }

    public function testAnAdminSavesAndReadsTheThemeBack(): void
    {
        $admin = $this->rootAdmin();

        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(), 'css' => $this->sample()])
            ->assertOk()
            ->assertJsonPath('config.accent', '#0891b2');

        $this->actingAs($admin)->getJson('/api/client/theme')->assertOk()->assertJsonPath('config.layout', 'grid');
        $this->assertSame($this->sample(), app(ThemeService::class)->css());
    }

    public function testWhatIsSavedIsPrintedIntoThePages(): void
    {
        $this->actingAs($this->rootAdmin())->putJson('/api/client/theme', ['config' => $this->config(), 'css' => $this->sample(), 'attributes' => ['data-chrome' => 'floating']])->assertOk();

        // The head of the React pages, with what the composer of the views adds.
        $html = view('partials.theme')->render();
        $this->assertStringContainsString('<style id="stratosphere-custom-theme">', $html);
        $this->assertStringContainsString('--card-alpha: 0.58;', $html);
        $this->assertStringContainsString("'dark'", str_replace('"', "'", $html));
        $this->assertStringContainsString('"data-chrome":"floating"', $html);
    }

    public function testBadSettingsAreRefused(): void
    {
        $admin = $this->rootAdmin();

        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(['accent' => 'red']), 'css' => ''])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(['background' => ['image' => 'http://x.example/a.png']]), 'css' => ''])->assertStatus(400);
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(), 'css' => 'body { color: red; }'])->assertStatus(400);
    }

    public function testTheLayoutSettingsAreChecked(): void
    {
        $admin = $this->rootAdmin();

        foreach ([
            ['sidebars' => ['server' => ['extra' => [['id' => 'abcd1234', 'label' => 'x', 'url' => 'javascript:alert(1)', 'newTab' => true]]]]],
            ['sidebars' => ['account' => ['extra' => [['id' => 'abcd1234', 'label' => 'x', 'url' => '//evil.example', 'newTab' => true]]]]],
            ['sidebars' => ['dashboard' => ['enabled' => 'maybe']]],
            ['row' => ['metrics' => ['cpu', 'cpu']]],
            ['row' => ['metrics' => ['cpu', 'bitcoin']]],
            ['nav' => 'neon'],
            ['status' => ['success' => 'green']],
            ['console' => ['brightness' => 5]],
            ['fontScale' => 400],
            ['powerDock' => 'rocket'],
            ['folders' => ['style' => 'drawers']],
            ['banners' => ['dim' => 99]],
            ['customGradient' => ['light' => ['#ffffff', 'nope']]],
            ['customGradient' => ['dark' => ['#000000', 'red']]],
            ['customGradient' => ['angle' => 900]],
            ['login' => ['layout' => 'wizard']],
            ['login' => ['background' => 'fireworks']],
            ['login' => ['features' => ['a', 'b', 'c', 'd', 'e']]],
            ['login' => ['title' => str_repeat('x', 80)]],
            ['login' => ['gradient' => 'Bad Gradient!']],
            ['motion' => ['buttonHover' => 'explode']],
            ['row' => ['size' => 'gigantic']],
            ['row' => ['metricStyle' => 'pie']],
            ['pageWidth' => 'huge'],
        ] as $changes) {
            $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config($changes), 'css' => ''])->assertStatus(422);
        }

        // A banner with a name that is no egg number or software, or a picture that is not allowed, is refused by the service rather than the form.
        foreach ([
            ['banners' => ['eggs' => ['nope' => '/branding/a.png']]],
            ['banners' => ['eggs' => ['1' => 'http://img.example.com/a.png']]],
            ['banners' => ['software' => ['paper' => '/branding/a.png']]],
        ] as $changes) {
            $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config($changes), 'css' => ''])->assertStatus(400);
        }

        $tooFew = $this->config();
        $tooFew['customGradient']['light'] = ['#ffffff'];
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $tooFew, 'css' => ''])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(['login' => ['image' => 'http://x.example/a.png']]), 'css' => ''])->assertStatus(400);
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(), 'css' => ''])->assertOk();
    }

    public function testTheMarksOnThePageAreFilteredAndPrinted(): void
    {
        $admin = $this->rootAdmin();
        $attributes = ['data-chrome' => 'floating', 'data-btn-hover' => 'lift', 'onclick' => 'alert(1)', 'data-nav' => '"><script>', 'data-speed' => 'fast'];

        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(), 'css' => '', 'attributes' => $attributes])->assertOk();

        $this->assertSame(['data-chrome' => 'floating', 'data-btn-hover' => 'lift', 'data-speed' => 'fast', 'data-bg-image' => 'false'], app(ThemeService::class)->attributes());
        $html = view('partials.theme')->render();
        $this->assertStringContainsString('"data-btn-hover":"lift"', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertStringNotContainsString('<script>alert', $html);
    }

    public function testResetGoesBackToTheDefaultLook(): void
    {
        $admin = $this->rootAdmin();
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(), 'css' => $this->sample()])->assertOk();

        $this->actingAs($admin)->deleteJson('/api/client/theme')->assertOk()->assertJsonPath('css', '');
        $this->assertNull(app(ThemeService::class)->config());
        $this->assertSame('', app(ThemeService::class)->css());
    }

    public function testOnlyAdminsWhoMayChangeTheBrandingCanUseIt(): void
    {
        $user = $this->makeUser();

        $this->actingAs($user)->getJson('/api/client/theme')->assertForbidden();
        $this->actingAs($user)->putJson('/api/client/theme', ['config' => $this->config(), 'css' => ''])->assertForbidden();
        $this->actingAs($this->userWith(['settings.branding.update']))->getJson('/api/client/theme')->assertOk();
    }

    public function testOnlyThePreviewRequestMayBeFramed(): void
    {
        $this->get('/auth/login?theme-preview=1')->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $this->get('/auth/login')->assertHeader('X-Frame-Options', 'DENY');
    }

    public function testAPictureCanBeUploadedForABackground(): void
    {
        $admin = $this->rootAdmin();

        $response = $this->actingAs($admin)->post('/api/client/theme/background', ['image' => \Illuminate\Http\UploadedFile::fake()->image('bg.jpg', 64, 64)], ['Accept' => 'application/json'])->assertOk();
        $url = $response->json('url');

        try {
            $this->assertMatchesRegularExpression('#^/branding/background-[a-f0-9]{12}\.jpg$#', $url);
            $this->assertFileExists(public_path($url));
            // The address it gives is one the theme accepts, in the CSS and in the settings.
            $this->assertNotNull(app(ThemeService::class)->sanitize('html:root { --bg-image: url("' . $url . '"); }'));
            $this->assertTrue(ThemeService::imageAllowed($url));
        } finally {
            @unlink(public_path($url));
        }

        $this->actingAs($admin)->post('/api/client/theme/background', ['image' => \Illuminate\Http\UploadedFile::fake()->create('evil.php', 1, 'application/x-php')], ['Accept' => 'application/json'])->assertStatus(422);
        $this->actingAs($this->makeUser())->post('/api/client/theme/background', ['image' => \Illuminate\Http\UploadedFile::fake()->image('bg.jpg')], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function testTheEggsAreListedForTheBanners(): void
    {
        $this->actingAs($this->rootAdmin())->getJson('/api/client/theme/eggs')->assertOk()->assertJsonStructure([['id', 'name', 'nest']]);
        $this->actingAs($this->makeUser())->getJson('/api/client/theme/eggs')->assertForbidden();
    }

    public function testTheBrandingCanBeSavedFromTheEditor(): void
    {
        $admin = $this->rootAdmin();
        $announcement = ['id' => '', 'title' => 'Hello', 'message' => 'The node restarts.', 'type' => 'warning', 'enabled' => true, 'dismissible' => false, 'link_label' => 'Status', 'link_url' => 'https://status.example.com'];

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['announcements' => [$announcement], 'links' => [['label' => 'Rules', 'url' => '/rules', 'location' => 'footer', 'new_tab' => false]]])
            ->assertOk()
            ->assertJsonPath('announcements.0.message', 'The node restarts.')
            ->assertJsonPath('links.0.label', 'Rules');

        // Sending only one of the lists leaves the other alone.
        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['links' => []])->assertOk()->assertJsonCount(0, 'links')->assertJsonCount(1, 'announcements');

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['links' => [['label' => 'x', 'url' => 'javascript:alert(1)', 'location' => 'footer']]])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['announcements' => [['message' => 'x', 'type' => 'loud']]])->assertStatus(422);
        $this->actingAs($this->makeUser())->putJson('/api/client/theme/branding', ['links' => []])->assertForbidden();
        $this->actingAs($this->makeUser())->getJson('/api/client/theme/branding')->assertForbidden();

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['announcements' => [], 'links' => []])->assertOk();
    }

    public function testSearchAndSharingSettingsAreSavedAndPrinted(): void
    {
        $admin = $this->rootAdmin();
        $seo = [
            'title' => 'Koko Hosting', 'description' => 'Minecraft servers in a minute.', 'share_image' => '/branding/background-abcdef123456.jpg',
            'theme_color' => '#1447e6', 'app_name' => 'Koko Hosting Panel', 'app_short_name' => 'Koko', 'index' => true,
        ];

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['seo' => $seo])->assertOk()->assertJsonPath('seo.title', 'Koko Hosting');

        $html = view('partials.seo')->render();
        $this->assertStringContainsString('<meta name="description" content="Minecraft servers in a minute.">', $html);
        $this->assertStringContainsString('<meta property="og:title" content="Koko Hosting">', $html);
        $this->assertStringContainsString('<meta property="og:image" content="' . url('/branding/background-abcdef123456.jpg') . '">', $html);
        $this->assertStringContainsString('content="summary_large_image"', $html);
        $this->assertStringContainsString('content="index, follow"', $html);
        $this->assertStringContainsString('<link rel="manifest" href="/manifest.webmanifest">', $html);
        $this->assertStringContainsString('content="Koko"', $html);

    }

    public function testTheManifestIsPublic(): void
    {
        app(BrandingService::class)->saveSeo(['app_name' => 'Koko Hosting Panel', 'app_short_name' => 'Koko', 'theme_color' => '#1447e6']);

        // Nobody is signed in, a browser asks for it by itself.
        $this->get('/manifest.webmanifest')->assertOk()->assertHeader('Content-Type', 'application/manifest+json')
            ->assertJsonPath('name', 'Koko Hosting Panel')->assertJsonPath('short_name', 'Koko')->assertJsonPath('theme_color', '#1447e6')
            ->assertJsonPath('display', 'standalone');
    }

    public function testBadSearchAndSharingSettingsAreRefused(): void
    {
        $admin = $this->rootAdmin();

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['seo' => ['theme_color' => 'blue']])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['seo' => ['title' => str_repeat('x', 90)]])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['seo' => ['share_image' => 'http://x.example/a.png']])->assertStatus(400);
    }

    public function testTheDefaultPagesStayHiddenFromSearchEngines(): void
    {
        $html = view('partials.seo')->render();

        $this->assertStringContainsString('content="noindex"', $html);
        $this->assertStringNotContainsString('name="description"', $html);
    }

    public function testTheConsolePromptDefaultsToStratosphereAndCanBeChanged(): void
    {
        $admin = $this->rootAdmin();
        $branding = app(BrandingService::class);

        $this->assertSame('container@stratosphere~', $branding->consolePrompt());
        $this->actingAs($admin)->getJson('/api/client/theme/branding')->assertOk()->assertJsonPath('console_prompt', 'container@stratosphere~');

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['console_prompt' => 'koko@hosting~'])->assertOk()->assertJsonPath('console_prompt', 'koko@hosting~');
        $this->assertSame('koko@hosting~', $branding->consolePrompt());
        // The panel hands it to the page with the rest of the branding.
        $this->assertSame('koko@hosting~', $branding->toArray(true)['console_prompt']);

        // Empty goes back to the default, a prompt with control characters or a lot of text is refused.
        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['console_prompt' => ''])->assertOk()->assertJsonPath('console_prompt', 'container@stratosphere~');
        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['console_prompt' => "x\e[31m"])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['console_prompt' => str_repeat('a', 41)])->assertStatus(422);
        $this->actingAs($this->makeUser())->putJson('/api/client/theme/branding', ['console_prompt' => 'x'])->assertForbidden();
    }

    public function testTheAdminBrandingPageHasTheConsolePrompt(): void
    {
        $admin = $this->rootAdmin();
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        $this->actingAs($admin)->get('/admin/settings/branding')->assertOk()->assertSee('Console prompt')->assertSee('container@stratosphere~');
        $this->actingAs($admin)->patch('/admin/settings/branding', ['console_prompt' => 'koko@hosting~'])->assertRedirect();
        $this->assertSame('koko@hosting~', app(BrandingService::class)->consolePrompt());
    }

    public function testAdminsCanKeepTheirOwnPresets(): void
    {
        $admin = $this->rootAdmin();

        $this->actingAs($admin)->getJson('/api/client/theme/presets')->assertOk()->assertExactJson([]);

        $saved = $this->actingAs($admin)->postJson('/api/client/theme/presets', ['name' => 'My teal look', 'config' => $this->config(['accent' => '#0d9488'])])->assertOk()->json();
        $this->assertCount(1, $saved);
        $this->assertSame('My teal look', $saved[0]['name']);
        $this->assertSame('#0d9488', $saved[0]['config']['accent']);
        $this->assertNull($saved[0]['config']['preset']);
        $id = $saved[0]['id'];

        // Replacing it keeps the id, renaming only changes the name, deleting removes it.
        $replaced = $this->actingAs($admin)->postJson('/api/client/theme/presets', ['id' => $id, 'name' => 'My teal look', 'config' => $this->config(['accent' => '#115e59'])])->assertOk()->json();
        $this->assertCount(1, $replaced);
        $this->assertSame('#115e59', $replaced[0]['config']['accent']);
        $this->actingAs($admin)->putJson('/api/client/theme/presets/' . $id, ['name' => 'Teal v2'])->assertOk()->assertJsonPath('0.name', 'Teal v2')->assertJsonPath('0.config.accent', '#115e59');
        $this->actingAs($admin)->getJson('/api/client/theme/presets')->assertJsonCount(1);
        $this->actingAs($admin)->deleteJson('/api/client/theme/presets/' . $id)->assertOk()->assertExactJson([]);
    }

    public function testBadPresetsAreRefused(): void
    {
        $admin = $this->rootAdmin();

        $this->actingAs($admin)->postJson('/api/client/theme/presets', ['name' => '', 'config' => $this->config()])->assertStatus(422);
        $this->actingAs($admin)->postJson('/api/client/theme/presets', ['name' => str_repeat('x', 41), 'config' => $this->config()])->assertStatus(422);
        $this->actingAs($admin)->postJson('/api/client/theme/presets', ['name' => 'x', 'config' => $this->config(['accent' => 'red'])])->assertStatus(422);
        $this->actingAs($admin)->postJson('/api/client/theme/presets', ['name' => 'x', 'config' => $this->config(['background' => ['image' => 'http://x.example/a.png']])])->assertStatus(400);
        $this->actingAs($admin)->postJson('/api/client/theme/presets', ['id' => 'zzzzzzzz', 'name' => 'x', 'config' => $this->config()])->assertStatus(400);
        $this->actingAs($admin)->putJson('/api/client/theme/presets/zzzzzzzz', ['name' => 'x'])->assertStatus(400);
        $this->actingAs($this->makeUser())->getJson('/api/client/theme/presets')->assertForbidden();
        $this->actingAs($this->makeUser())->postJson('/api/client/theme/presets', ['name' => 'x', 'config' => $this->config()])->assertForbidden();
    }

    public function testThereIsALimitToThePresets(): void
    {
        $admin = $this->rootAdmin();
        for ($i = 0; $i < ThemeService::MAX_PRESETS; ++$i) {
            app(ThemeService::class)->savePreset(null, 'Preset ' . $i, $this->config());
        }

        $this->actingAs($admin)->postJson('/api/client/theme/presets', ['name' => 'One too many', 'config' => $this->config()])->assertStatus(400);
    }

    public function testThePageKnowsWhenAPictureIsBehindIt(): void
    {
        $admin = $this->rootAdmin();

        $this->assertSame('false', app(ThemeService::class)->attributes()['data-bg-image']);

        // The mark comes from the CSS, whatever the editor sent along.
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(), 'css' => $this->sample(), 'attributes' => ['data-bg-image' => 'false']])->assertOk();
        $this->assertSame('true', app(ThemeService::class)->attributes()['data-bg-image']);
        $this->assertStringContainsString('"data-bg-image":"true"', view('partials.theme')->render());

        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(['background' => ['image' => null]]), 'css' => 'html:root { --r: 1rem; }', 'attributes' => []])->assertOk();
        $this->assertSame('false', app(ThemeService::class)->attributes()['data-bg-image']);
    }

    public function testLinkCardsOfTheDashboardCanBeSavedAndAreHandedToTheSignedInPage(): void
    {
        $admin = $this->rootAdmin();
        $cards = [
            [
                'id' => '', 'title' => 'Need a hand?', 'position' => 'top', 'style' => 'grid', 'enabled' => true,
                'links' => [
                    ['label' => 'Discord', 'url' => 'https://discord.gg/example', 'icon' => 'discord', 'new_tab' => true],
                    ['label' => 'Support', 'url' => '/support', 'icon' => 'support', 'new_tab' => false],
                ],
            ],
            ['id' => '', 'title' => 'Hidden', 'position' => 'bottom', 'style' => 'list', 'enabled' => false, 'links' => [['label' => 'x', 'url' => '/x', 'icon' => 'link']]],
            ['id' => '', 'title' => 'Empty', 'position' => 'bottom', 'style' => 'cards', 'enabled' => true, 'links' => []],
        ];

        $saved = $this->actingAs($admin)->putJson('/api/client/theme/branding', ['link_cards' => $cards])->assertOk()->json('link_cards');
        $this->assertCount(3, $saved);
        $this->assertMatchesRegularExpression('/^[a-z0-9]{10}$/', $saved[0]['id']);
        $this->assertSame('grid', $saved[0]['style']);

        // The page gets only the cards that are on and have a link, and nothing before a person signs in.
        $branding = app(BrandingService::class);
        $this->assertSame(['Need a hand?'], array_column($branding->toArray(true)['link_cards'], 'title'));
        $this->assertSame([], $branding->toArray(false)['link_cards']);

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['link_cards' => []])->assertOk()->assertJsonCount(0, 'link_cards');
    }

    public function testBadLinkCardsAreRefused(): void
    {
        $admin = $this->rootAdmin();
        $card = fn (array $changes = [], array $link = []) => array_replace_recursive([
            'title' => 'T', 'position' => 'top', 'style' => 'cards', 'enabled' => true,
            'links' => [array_merge(['label' => 'A', 'url' => 'https://a.example', 'icon' => 'link', 'new_tab' => true], $link)],
        ], $changes);

        foreach ([
            $card(['style' => 'masonry']),
            $card(['position' => 'left']),
            $card([], ['url' => 'javascript:alert(1)']),
            $card([], ['url' => '//evil.example']),
            $card([], ['icon' => 'Bad Icon!']),
            $card([], ['label' => '']),
        ] as $bad) {
            $this->actingAs($admin)->putJson('/api/client/theme/branding', ['link_cards' => [$bad]])->assertStatus(422);
        }

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['link_cards' => array_fill(0, 9, $card())])->assertStatus(422);
        $this->actingAs($this->makeUser())->putJson('/api/client/theme/branding', ['link_cards' => []])->assertForbidden();
    }

    public function testAnnouncementsKeepWhereTheyAreShownAndWhoTheyAreFor(): void
    {
        $admin = $this->rootAdmin();
        $first = ['id' => '', 'title' => 'Paper news', 'message' => 'Update Paper.', 'type' => 'success', 'enabled' => true, 'dismissible' => true, 'where' => ['server', 'account'], 'eggs' => [3, 3, 5], 'software' => ['PAPER', 'VANILLA'], 'nodes' => ['Dallas']];
        $second = ['id' => '', 'title' => 'Plain', 'message' => 'Hello.', 'type' => 'info', 'enabled' => true, 'dismissible' => true];

        $saved = $this->actingAs($admin)->putJson('/api/client/theme/branding', ['announcements' => [$first, $second]])->assertOk()->json('announcements');
        $this->assertSame(['server', 'account'], $saved[0]['where']);
        $this->assertSame([3, 5], $saved[0]['eggs']);
        $this->assertSame(['PAPER', 'VANILLA'], $saved[0]['software']);
        $this->assertSame(['Dallas'], $saved[0]['nodes']);
        // Without any of it an announcement is for the dashboard and for everybody.
        $this->assertSame(['dashboard'], $saved[1]['where']);
        $this->assertSame([], $saved[1]['eggs']);

        // The order that was sent is the order that is kept, and the settings reach the page.
        $reordered = $this->actingAs($admin)->putJson('/api/client/theme/branding', ['announcements' => [$saved[1], $saved[0]]])->assertOk()->json('announcements');
        $this->assertSame(['Plain', 'Paper news'], array_column($reordered, 'title'));
        $this->assertSame(['server', 'account'], app(BrandingService::class)->toArray(true)['announcements'][1]['where']);

        // A form that knows nothing of these (the old page of the admin area) leaves them as they are.
        $old = array_map(fn ($a) => array_diff_key($a, array_flip(['where', 'eggs', 'software', 'nodes'])), $reordered);
        app(BrandingService::class)->saveAnnouncements($old);
        $this->assertSame(['server', 'account'], app(BrandingService::class)->announcements()[1]['where']);
        $this->assertSame([3, 5], app(BrandingService::class)->announcements()[1]['eggs']);

        app(BrandingService::class)->saveAnnouncements([]);
    }

    public function testBadAnnouncementAudiencesAreRefused(): void
    {
        $admin = $this->rootAdmin();
        $base = ['message' => 'x', 'type' => 'info', 'enabled' => true, 'dismissible' => true];

        foreach ([
            ['where' => ['moon']],
            ['where' => []],
            ['eggs' => ['abc']],
            ['software' => ['paper']],
            ['nodes' => [str_repeat('n', 101)]],
        ] as $bad) {
            $this->actingAs($admin)->putJson('/api/client/theme/branding', ['announcements' => [array_merge($base, $bad)]])->assertStatus(422);
        }
    }

    public function testTheNodesAreListedForTheAnnouncements(): void
    {
        \Pterodactyl\Models\Node::factory()->create([
            'name' => 'Theme test node',
            'fqdn' => 'theme-' . bin2hex(random_bytes(3)) . '.example.com',
            'location_id' => \Pterodactyl\Models\Location::query()->first()?->id ?? \Pterodactyl\Models\Location::factory()->create()->id,
        ]);

        $this->actingAs($this->rootAdmin())->getJson('/api/client/theme/nodes')->assertOk()->assertJsonStructure([['id', 'name']]);
        $this->actingAs($this->makeUser())->getJson('/api/client/theme/nodes')->assertForbidden();
    }

    public function testLinkCardsAreForPlacesToo(): void
    {
        $admin = $this->rootAdmin();
        $card = ['title' => 'Help', 'position' => 'top', 'style' => 'grid', 'enabled' => true, 'where' => ['dashboard', 'server'], 'links' => [['label' => 'Discord', 'url' => 'https://discord.gg/x', 'icon' => 'discord']]];

        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['link_cards' => [$card]])->assertOk()->assertJsonPath('link_cards.0.where', ['dashboard', 'server']);
        $this->actingAs($admin)->putJson('/api/client/theme/branding', ['link_cards' => [array_merge($card, ['where' => ['moon']])]])->assertStatus(422);
        app(BrandingService::class)->saveLinkCards([]);
    }
}

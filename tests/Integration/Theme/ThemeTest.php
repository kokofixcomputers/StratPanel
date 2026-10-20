<?php

namespace Pterodactyl\Tests\Integration\Theme;

use Pterodactyl\Services\Theme\ThemeService;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

class ThemeTest extends RoleTestCase
{
    private function config(array $changes = []): array
    {
        return array_replace_recursive([
            'accent' => '#0891b2', 'secondary' => null, 'mode' => 'dark', 'radius' => 'round', 'buttons' => 'pill', 'shadow' => 'soft',
            'density' => 'compact', 'font' => 'system', 'layout' => 'grid', 'columns' => 2, 'glass' => 30, 'glassBlur' => 10,
            'background' => ['image' => 'gradient:aurora', 'blur' => 4, 'dim' => 10], 'preset' => null,
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
        $this->actingAs($this->rootAdmin())->putJson('/api/client/theme', ['config' => $this->config(), 'css' => $this->sample()])->assertOk();

        // The head of the React pages, with what the composer of the views adds.
        $html = view('partials.theme')->render();
        $this->assertStringContainsString('<style id="stratosphere-custom-theme">', $html);
        $this->assertStringContainsString('--card-alpha: 0.55;', $html);
        $this->assertStringContainsString("'dark'", str_replace('"', "'", $html));
    }

    public function testBadSettingsAreRefused(): void
    {
        $admin = $this->rootAdmin();

        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(['accent' => 'red']), 'css' => ''])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(['background' => ['image' => 'http://x.example/a.png']]), 'css' => ''])->assertStatus(400);
        $this->actingAs($admin)->putJson('/api/client/theme', ['config' => $this->config(), 'css' => 'body { color: red; }'])->assertStatus(400);
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
}

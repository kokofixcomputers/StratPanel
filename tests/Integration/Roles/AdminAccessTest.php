<?php

namespace Pterodactyl\Tests\Integration\Roles;

use Pterodactyl\Models\User;
use Pterodactyl\Models\Location;

/** What roles open and close in the admin area, for real requests. */
class AdminAccessTest extends RoleTestCase
{
    public function testSomebodyWithoutARoleIsKeptOut(): void
    {
        $this->get('/admin')->assertStatus(403);
        $this->actingAs($this->makeUser())->get('/admin')->assertStatus(403);
        $this->get('/admin/users')->assertStatus(403);
        $this->get('/admin/roles')->assertStatus(403);
        $this->get('/admin/settings')->assertStatus(403);
    }

    public function testARoleWithoutAnAdminPermissionKeepsOut(): void
    {
        $this->actingAs($this->userWith([]))->get('/admin')->assertStatus(403);
    }

    public function testRootAdminsOpenEverything(): void
    {
        $this->actingAs($this->rootAdmin());

        foreach (['/admin', '/admin/users', '/admin/roles', '/admin/servers', '/admin/nodes', '/admin/locations', '/admin/databases', '/admin/mounts',
            '/admin/nests', '/admin/extensions', '/admin/settings', '/admin/settings/mail', '/admin/settings/advanced', '/admin/settings/branding', '/admin/settings/pools',
            '/admin/settings/authentication', '/admin/settings/providers', '/admin/settings/curseforge', '/admin/api'] as $uri) {
            $this->page($uri)->assertOk();
        }
    }

    public function testTheAdminAreaHasTheThemeOfThePanel(): void
    {
        $this->actingAs($this->rootAdmin());

        // The pages that are not part of the React app yet (Blade) have the same light and dark theme as the panel: its variables, the
        // choice kept in the browser and a way to change it.
        $this->page('/admin/nodes')->assertOk()
            ->assertSee('themes/pterodactyl/css/panel-theme.css', false)
            ->assertSee('stratosphere:theme', false)
            ->assertSee('id="admin-theme-toggle"', false);
    }

    public function testARoleOpensWhatItGivesAndNothingElse(): void
    {
        $this->actingAs($this->userWith(['users.view']));

        $this->page('/admin/users')->assertOk();
        $this->get('/admin/servers')->assertStatus(403);
        $this->get('/admin/nodes')->assertStatus(403);
        $this->get('/admin/roles')->assertStatus(403);
        $this->get('/admin/settings')->assertStatus(403);
        $this->get('/admin/settings/mail')->assertStatus(403);
        $this->get('/admin/extensions')->assertStatus(403);
        $this->get('/admin/api')->assertStatus(403);
    }

    public function testSeeingIsNotChanging(): void
    {
        $viewer = $this->userWith(['users.view']);
        $target = $this->makeUser();
        $this->actingAs($viewer);

        $this->page('/admin/users/view/' . $target->id)->assertOk();
        $this->get('/admin/users/new')->assertStatus(403);
        $this->patchJson('/api/client/admin/users/' . $target->id, ['email' => 'new@' . self::DOMAIN, 'username' => 'changed', 'name_first' => 'a', 'name_last' => 'b', 'language' => 'en'])->assertStatus(403);
        $this->deleteJson('/api/client/admin/users/' . $target->id)->assertStatus(403);
        $this->postJson('/api/client/admin/users', [])->assertStatus(403);
        $this->assertNotSame('changed', $target->fresh()->username);
    }

    public function testEachPermissionOpensItsOwnAction(): void
    {
        $target = $this->makeUser();
        $this->actingAs($this->userWith(['users.update']));

        // users.update comes with users.view, and does not come with deleting or creating.
        $this->page('/admin/users/view/' . $target->id)->assertOk();
        $this->deleteJson('/api/client/admin/users/' . $target->id)->assertStatus(403);
        $this->postJson('/api/client/admin/users', [])->assertStatus(403);
    }

    public function testSettingsArePerPage(): void
    {
        $this->actingAs($this->userWith(['settings.branding.view']));

        $this->page('/admin/settings/branding')->assertOk();
        $this->get('/admin/settings')->assertStatus(403);
        $this->get('/admin/settings/mail')->assertStatus(403);
        $this->get('/admin/settings/authentication')->assertStatus(403);
        $this->get('/admin/settings/providers')->assertStatus(403);
        $this->get('/admin/settings/curseforge')->assertStatus(403);
        $this->get('/admin/settings/advanced')->assertStatus(403);
        $this->postJson('/api/client/admin/settings/branding', [])->assertStatus(403);
    }

    public function testSavingSettingsNeedsTheUpdatePermission(): void
    {
        $this->actingAs($this->userWith(['settings.authentication.view']));
        $this->patchJson('/api/client/admin/settings/authentication', ['captcha' => 'none', 'registration' => '1'])->assertStatus(403);
        $this->assertNotSame('true', \DB::table('settings')->where('key', 'settings::auth:registration:enabled')->value('value'));

        $this->signOut();
        $this->actingAs($this->userWith(['settings.authentication.update']));
        $this->patchJson('/api/client/admin/settings/authentication', ['captcha' => 'none', 'registration' => '1'])->assertOk();
        $this->assertSame('true', \DB::table('settings')->where('key', 'settings::auth:registration:enabled')->value('value'));
        \DB::table('settings')->where('key', 'like', 'settings::auth:%')->delete();
    }

    public function testTheApplicationApiStaysForRootAdmins(): void
    {
        $this->actingAs($this->userWith(\Pterodactyl\Services\Roles\PermissionRegistry::all()));

        $this->get('/admin/api')->assertStatus(403);
        $this->get('/admin/api/new')->assertStatus(403);
        $this->postJson('/api/client/admin/application-keys', ['memo' => 'x'])->assertStatus(403);
        $this->getJson('/api/client/admin/application-keys')->assertStatus(403);
    }

    public function testTheOverviewIsAPermissionToo(): void
    {
        $this->actingAs($this->userWith(['users.view']));
        $this->get('/admin')->assertRedirect(route('admin.users'));

        $this->signOut();
        $this->actingAs($this->userWith(['overview.view']));
        $this->page('/admin')->assertOk();
    }

    /** Only the menu, the pages have links of their own. */
    private function sidebar(string $html): string
    {
        $start = strpos($html, '<nav class="admin-nav">');
        $end = strpos($html, '</nav>', $start);

        return substr($html, $start, $end - $start);
    }

    public function testTheSidebarOnlyShowsWhatIsOpen(): void
    {
        $this->actingAs($this->userWith(['overview.view', 'users.view', 'nodes.view']));
        $html = $this->sidebar($this->page('/admin/nodes')->assertOk()->getContent());

        $this->assertStringContainsString(route('admin.users'), $html);
        $this->assertStringContainsString(route('admin.nodes'), $html);
        $this->assertStringNotContainsString('href="' . route('admin.servers') . '"', $html);
        $this->assertStringNotContainsString('href="' . route('admin.roles') . '"', $html);
        $this->assertStringNotContainsString('href="' . route('admin.extensions') . '"', $html);
        $this->assertStringNotContainsString('Application API', $html);
    }

    public function testRootAdminsSeeTheWholeSidebar(): void
    {
        $this->actingAs($this->rootAdmin());
        $html = $this->sidebar($this->page('/admin/nodes')->assertOk()->getContent());

        foreach (['admin.users', 'admin.servers', 'admin.nodes', 'admin.roles', 'admin.extensions', 'admin.mounts', 'admin.nests', 'admin.locations', 'admin.databases', 'admin.api.index'] as $route) {
            $this->assertStringContainsString('href="' . route($route) . '"', $html, $route);
        }
        $this->assertStringContainsString('Application API', $html);
    }

    public function testEachPageOfSettingsHasItsOwnData(): void
    {
        $this->actingAs($this->userWith(['settings.mail.view', 'settings.branding.view']));

        $this->getJson('/api/client/admin/settings/mail')->assertOk();
        $this->getJson('/api/client/admin/settings/branding')->assertOk();
        $this->getJson('/api/client/admin/settings/advanced')->assertStatus(403);
        $this->getJson('/api/client/admin/settings/providers')->assertStatus(403);
        $this->getJson('/api/client/admin/settings/certificates')->assertStatus(403);
    }

    public function testLocationsAreDeletedWithTheirOwnPermission(): void
    {
        $location = Location::query()->create(['short' => 'perm' . bin2hex(random_bytes(3)), 'long' => 'x']);
        $this->actingAs($this->userWith(['locations.update']));

        $url = '/api/client/admin/locations/' . $location->id;
        $this->patchJson($url, ['short' => $location->short, 'long' => 'changed'])->assertOk();
        $this->deleteJson($url)->assertStatus(403);
        $this->assertNotNull(Location::query()->find($location->id));

        $this->signOut();
        $this->actingAs($this->userWith(['locations.delete']));
        $this->patchJson($url, ['short' => $location->short, 'long' => 'x'])->assertStatus(403);
        $this->deleteJson($url)->assertNoContent();
        $this->assertNull(Location::query()->find($location->id));
    }

    public function testRemovingARoleClosesTheDoorAtOnce(): void
    {
        $user = $this->makeUser();
        $role = $this->role(['users.view']);
        $user->roles()->attach($role->id);
        $this->actingAs($user->fresh());
        $this->page('/admin/users')->assertOk();

        $role->delete();
        $this->signOut();
        $this->actingAs($user->fresh());

        $this->get('/admin/users')->assertStatus(403);
    }

    public function testASessionOfSomebodyWhoLostTheirRoleIsRefusedToo(): void
    {
        $user = $this->makeUser();
        $role = $this->role(['users.view']);
        $user->roles()->attach($role->id);

        $this->actingAs($user)->page('/admin/users')->assertOk();

        // Checked on every request from the database, not remembered with the login.
        $role->update(['permissions' => ['nodes.view']]);
        $this->actingAs(User::query()->findOrFail($user->id))->get('/admin/users')->assertStatus(403);
    }
}

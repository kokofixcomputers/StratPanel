<?php

namespace Pterodactyl\Tests\Integration\Roles;

use Illuminate\Support\Facades\Route;
use Pterodactyl\Services\Roles\AdminNavigation;
use Pterodactyl\Services\Roles\PermissionRegistry;

class PermissionsTest extends RoleTestCase
{
    // ---- the registry ---------------------------------------------------------------------------------------------------

    public function testEveryPermissionIsGroupedAndHasALabel(): void
    {
        $all = PermissionRegistry::all();

        $this->assertCount(count(array_unique($all)), $all, 'no permission is listed twice');
        foreach ($all as $permission) {
            $this->assertMatchesRegularExpression('/^[a-z]+(\.[a-z]+){1,2}$/', $permission);
            $this->assertNotEmpty(PermissionRegistry::label($permission));
        }
        $this->assertGreaterThan(60, count($all), 'permissions are fine grained');
    }

    public function testEveryPermissionNeedsTheViewOfItsGroup(): void
    {
        $this->assertSame('users.view', PermissionRegistry::viewOf('users.update'));
        $this->assertSame('servers.view', PermissionRegistry::viewOf('servers.suspend'));
        $this->assertSame('settings.mail.view', PermissionRegistry::viewOf('settings.mail.update'));
        $this->assertSame('nests.view', PermissionRegistry::viewOf('eggs.update'));
        $this->assertNull(PermissionRegistry::viewOf('users.view'));
        $this->assertNull(PermissionRegistry::viewOf('servers.access'), 'opening servers in the panel does not need the admin pages');
        $this->assertNull(PermissionRegistry::viewOf('overview.view'));

        foreach (PermissionRegistry::all() as $permission) {
            $view = PermissionRegistry::viewOf($permission);
            $this->assertTrue($view === null || PermissionRegistry::exists($view), "$permission needs a view that exists");
        }
    }

    public function testNormalizingAddsTheViewDropsTheUnknownAndKeepsTheOrder(): void
    {
        $result = PermissionRegistry::normalize(['servers.delete', 'nonsense', 'users.update', 'servers.delete', 42, null, 'users.view']);

        $this->assertSame(['users.view', 'users.update', 'servers.view', 'servers.delete'], $result);
        $this->assertSame([], PermissionRegistry::normalize([]));
        $this->assertSame(['servers.access'], PermissionRegistry::normalize(['servers.access']));
    }

    // ---- who holds what -------------------------------------------------------------------------------------------------

    public function testRootAdminsHoldEverything(): void
    {
        $root = $this->rootAdmin();

        foreach (PermissionRegistry::all() as $permission) {
            $this->assertTrue($root->hasPermission($permission), $permission);
        }
        $this->assertTrue($root->hasPermission('something.that.does.not.exist'));
        $this->assertTrue($root->canAccessAdmin());
        $this->assertTrue($root->canAccessAllServers());
    }

    public function testNobodyElseHoldsAnythingWithoutARole(): void
    {
        $user = $this->makeUser();

        $this->assertFalse($user->hasPermission('overview.view'));
        $this->assertFalse($user->canAccessAdmin());
        $this->assertFalse($user->canAccessAllServers());
        $this->assertSame([], $user->rolePermissions());
    }

    public function testRolesAddUp(): void
    {
        $user = $this->makeUser();
        $user->roles()->attach([$this->role(['users.update'])->id, $this->role(['servers.suspend', 'nodes.view'])->id]);
        $user = $user->fresh();

        $this->assertTrue($user->hasPermission('users.update'));
        $this->assertTrue($user->hasPermission('users.view'), 'the view comes with it');
        $this->assertTrue($user->hasPermission('servers.suspend'));
        $this->assertTrue($user->hasPermission('nodes.view'));
        $this->assertFalse($user->hasPermission('users.delete'));
        $this->assertFalse($user->hasPermission('nodes.update'));
        $this->assertTrue($user->canAccessAdmin());
        $this->assertTrue($user->hasAnyPermission('users.delete', 'nodes.view'));
        $this->assertFalse($user->hasAnyPermission('users.delete', 'nodes.update'));
    }

    public function testAPermissionThatDoesNotExistGivesNothing(): void
    {
        $user = $this->userWith(['made.up', 'users.nonsense']);

        $this->assertFalse($user->canAccessAdmin());
        $this->assertFalse($user->hasPermission('made.up'));
    }

    public function testChangingARoleChangesWhatItsMembersHold(): void
    {
        $role = $this->role(['users.view']);
        $user = $this->makeUser();
        $user->roles()->attach($role->id);
        $this->assertTrue($user->fresh()->hasPermission('users.view'));

        $role->update(['permissions' => ['nodes.view']]);

        $fresh = $user->fresh();
        $this->assertFalse($fresh->hasPermission('users.view'));
        $this->assertTrue($fresh->hasPermission('nodes.view'));

        $role->delete();
        $this->assertFalse($user->fresh()->canAccessAdmin());
    }

    public function testAllServersAreOpenedWithAPermissionOfItsOwn(): void
    {
        $this->assertTrue($this->userWith(['servers.access'])->canAccessAllServers());
        $this->assertFalse($this->userWith(['servers.view', 'servers.delete'])->canAccessAllServers());
        $this->assertTrue($this->userWith(['servers.access'])->canAccessAdmin());
    }

    public function testNobodyOutranksARootAdminButARootAdmin(): void
    {
        $root = $this->rootAdmin();
        $other = $this->rootAdmin();
        $strong = $this->userWith(PermissionRegistry::all());

        $this->assertTrue($root->outranks($other));
        $this->assertTrue($root->outranks($strong));
        $this->assertFalse($strong->outranks($root));
        $this->assertFalse($strong->outranks($other));
    }

    public function testSomebodyOutranksOnlyWhoHoldsNoMoreThanThey(): void
    {
        $manager = $this->userWith(['users.update', 'servers.view', 'nodes.view']);

        $this->assertTrue($manager->outranks($this->makeUser()));
        $this->assertTrue($manager->outranks($this->userWith(['servers.view'])));
        $this->assertTrue($manager->outranks($this->userWith(['users.update', 'servers.view', 'nodes.view'])));
        $this->assertFalse($manager->outranks($this->userWith(['servers.delete'])));
        $this->assertFalse($manager->outranks($this->userWith(['servers.view', 'nodes.create'])));
    }

    public function testTheBrowserIsToldWhatTheAdminAreaAllows(): void
    {
        $page = $this->actingAs($this->userWith(['users.view']))->get('/')->getContent();
        $this->assertStringContainsString('"can_access_admin":true', $page);
        $this->assertStringContainsString('"can_access_all_servers":false', $page);
    }

    public function testThePageOfSomebodyWithoutRolesSaysTheAdminAreaIsClosed(): void
    {
        $this->assertStringContainsString('"can_access_admin":false', $this->actingAs($this->makeUser())->get('/')->getContent());
    }

    // ---- the routes -----------------------------------------------------------------------------------------------------

    /** The safety net: a page that is added to the admin area without a permission would be open to everybody with any role. */
    public function testEveryAdminRouteChecksAPermission(): void
    {
        $unchecked = [];
        $checked = 0;

        foreach (Route::getRoutes() as $route) {
            // The pages, and the API the pages of the admin area read and change things through.
            if (!str_starts_with($route->uri(), 'admin') && !str_starts_with($route->uri(), 'api/client/admin')) {
                continue;
            }
            $has = collect($route->gatherMiddleware())->contains(fn ($m) => is_string($m) && str_starts_with($m, 'admin.can:'));
            if (!$has && $route->uri() !== 'admin') {
                $unchecked[] = implode('|', $route->methods()) . ' ' . $route->uri();
            } else {
                ++$checked;
            }
        }

        $this->assertSame([], $unchecked, 'these admin routes check no permission');
        $this->assertGreaterThan(100, $checked);
    }

    public function testEveryPermissionOfARouteExists(): void
    {
        foreach (Route::getRoutes() as $route) {
            foreach ($route->gatherMiddleware() as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'admin.can:')) {
                    foreach (explode(',', substr($middleware, 10)) as $permission) {
                        $this->assertTrue($permission === 'root' || PermissionRegistry::exists($permission), "{$route->uri()} wants $permission");
                    }
                }
            }
        }
    }

    public function testEveryPermissionIsUsedBySomething(): void
    {
        $used = [];
        foreach (Route::getRoutes() as $route) {
            foreach ($route->gatherMiddleware() as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'admin.can:')) {
                    array_push($used, ...explode(',', substr($middleware, 10)));
                }
            }
        }
        // These are checked in code, not on a route.
        $elsewhere = ['overview.view', 'servers.access'];

        $this->assertSame([], array_values(array_diff(PermissionRegistry::all(), $used, $elsewhere)), 'a permission nothing checks is a lie in the role editor');
    }

    public function testTheNavigationFollowsThePermissions(): void
    {
        $this->assertSame('admin.settings.mail', AdminNavigation::settingsHome($this->userWith(['settings.mail.view'])));
        $this->assertSame('admin.settings', AdminNavigation::settingsHome($this->userWith(['settings.advanced.update', 'settings.general.view'])));
        $this->assertNull(AdminNavigation::settingsHome($this->userWith(['users.view'])));
        $this->assertSame('admin.users', AdminNavigation::landingRoute($this->userWith(['users.view'])));
        $this->assertSame('admin.index', AdminNavigation::landingRoute($this->userWith(['overview.view', 'users.view'])));
        $this->assertSame('admin.settings.branding', AdminNavigation::landingRoute($this->userWith(['settings.branding.update'])));
        $this->assertNull(AdminNavigation::landingRoute($this->makeUser()));
    }
}

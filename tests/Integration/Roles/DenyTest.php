<?php

namespace Pterodactyl\Tests\Integration\Roles;

use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Roles\PermissionRegistry;

/** A role grants, denies or says nothing: a denial wins, and what a role leaves alone stays as it was. */
class DenyTest extends RoleTestCase
{
    private function userWithRoles(array ...$roles): User
    {
        $user = $this->makeUser();
        foreach ($roles as $attributes) {
            $user->roles()->attach(Role::query()->create(array_merge(['name' => 'r' . bin2hex(random_bytes(3)), 'color' => '#3b82f6', 'permissions' => []], $attributes))->id);
        }

        return $user->fresh();
    }

    public function testEverybodyMayDoWhatIsLeftToTheDefault(): void
    {
        $nobody = $this->makeUser();

        $this->assertTrue($nobody->allowedTo('self.servers.create'));
        $this->assertFalse($nobody->allowedTo('self.servers.create', false), 'the default is what the panel says');
        $this->assertNull($nobody->permissionState('self.servers.create'));
    }

    public function testADenialTakesItAwayFromThePeopleWithTheRoleOnly(): void
    {
        $denied = $this->userWithRoles(['denied' => ['self.servers.create']]);
        $other = $this->makeUser();

        $this->assertFalse($denied->allowedTo('self.servers.create'));
        $this->assertFalse($denied->allowedTo('self.servers.create', true));
        $this->assertSame('deny', $denied->permissionState('self.servers.create'));
        $this->assertTrue($denied->allowedTo('self.ssh_keys.create'), 'only what the role denies');
        $this->assertTrue($other->allowedTo('self.servers.create'));
    }

    public function testAGrantAllowsWhatThePanelSwitchedOff(): void
    {
        $granted = $this->userWithRoles(['permissions' => ['self.servers.create']]);

        $this->assertTrue($granted->allowedTo('self.servers.create', false));
        $this->assertFalse($this->makeUser()->allowedTo('self.servers.create', false));
        $this->assertFalse($granted->canAccessAdmin(), 'what everybody may do never opens the admin area');
    }

    public function testADenialWinsOverAGrantOfAnotherRole(): void
    {
        $user = $this->userWithRoles(['permissions' => ['servers.delete']], ['denied' => ['servers.delete']]);

        $this->assertFalse($user->hasPermission('servers.delete'));
        $this->assertTrue($user->hasPermission('servers.view'), 'the see permission came with the grant and is not denied');
        $this->assertSame('deny', $user->permissionState('servers.delete'));
    }

    public function testDenyingTheViewOfAGroupDeniesTheRestOfIt(): void
    {
        $user = $this->userWithRoles(['permissions' => ['servers.delete', 'users.view']], ['denied' => ['servers.view']]);

        $this->assertFalse($user->hasPermission('servers.view'));
        $this->assertFalse($user->hasPermission('servers.delete'));
        $this->assertTrue($user->hasPermission('users.view'));
    }

    public function testADenialDoesNotLeaveAnAdminAreaWithNothingInIt(): void
    {
        $user = $this->userWithRoles(['permissions' => ['users.view'], 'denied' => ['users.view']]);

        $this->assertFalse($user->canAccessAdmin());
    }

    public function testRootAdminsAreNotLimited(): void
    {
        $root = $this->makeUser(['root_admin' => true]);
        $root->roles()->attach(Role::query()->create(['name' => 'limit', 'color' => '#3b82f6', 'permissions' => [], 'denied' => ['servers.delete', 'self.servers.create']])->id);
        $root = $root->fresh();

        $this->assertTrue($root->hasPermission('servers.delete'));
        $this->assertTrue($root->allowedTo('self.servers.create'));
    }

    public function testTheEditorSavesTheThreeStates(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->post('/admin/roles/new', [
            'name' => 'Restricted', 'color' => '#ff0000',
            'states' => ['users.update' => 'grant', 'self.servers.create' => 'deny', 'self.ssh_keys.create' => 'default', 'servers.delete' => 'deny'],
        ])->assertRedirect();

        $role = Role::query()->where('name', 'Restricted')->firstOrFail();
        $this->assertSame(['users.view', 'users.update'], $role->permissionList());
        $this->assertSame(['servers.delete', 'self.servers.create'], $role->deniedList());
        $this->assertSame([], $role->userGrantList());

        $this->page(route('admin.roles.view', $role->id, false))->assertOk()->assertSee('Default')->assertSee('Deny');
    }

    public function testSomethingBothGrantedAndDeniedIsDenied(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->post('/admin/roles/new', ['name' => 'Both', 'color' => '#ff0000', 'permissions' => ['servers.delete'], 'denied' => ['servers.delete']])->assertRedirect();

        $role = Role::query()->where('name', 'Both')->firstOrFail();
        $this->assertSame([], $role->permissionList());
        $this->assertSame(['servers.delete'], $role->deniedList());
    }

    public function testSomebodyWhoDoesNotHoldAnAdminPermissionCanNotGrantItButCanDenyIt(): void
    {
        $this->actingAs($this->userWith(['roles.create', 'servers.view']));

        $this->post('/admin/roles/new', ['name' => 'Over', 'color' => '#ff0000', 'states' => ['users.delete' => 'grant']])->assertStatus(400);
        $this->post('/admin/roles/new', ['name' => 'Down', 'color' => '#ff0000', 'states' => ['users.delete' => 'deny', 'self.servers.create' => 'grant']]);

        $role = Role::query()->where('name', 'Down')->firstOrFail();
        $this->assertSame(['users.delete'], $role->deniedList());
        $this->assertSame(['self.servers.create'], $role->userGrantList());
    }

    public function testTheUserLevelPermissionsAreNotAdminPermissions(): void
    {
        foreach (array_keys(PermissionRegistry::user()) as $key) {
            $this->assertNotContains($key, PermissionRegistry::all());
            $this->assertContains($key, PermissionRegistry::known());
        }
    }

    public function testADeniedPersonCanNotCreateAServerOrKeysButTheOthersCan(): void
    {
        config(['pterodactyl.self_service.enabled' => true]);
        $denied = $this->userWithRoles(['denied' => ['self.servers.create', 'self.ssh_keys.create', 'self.api_keys.create']]);

        $attributes = $this->actingAs($denied)->getJson('/api/client/self-service')->assertOk()->json('attributes');
        $this->assertFalse($attributes['enabled']);
        $this->assertFalse($attributes['can_create']);
        $this->actingAs($denied)->postJson('/api/client/self-service', ['name' => 'Nope'])->assertStatus(400)->assertSee('not allowed to create servers');
        $this->actingAs($denied)->postJson('/api/client/account/api-keys', ['description' => 'x', 'allowed_ips' => []])->assertStatus(400)->assertSee('not allowed to create API keys');

        // Somebody without a role is not stopped by it.
        $this->assertTrue($this->actingAs($this->makeUser())->getJson('/api/client/self-service')->assertOk()->json('attributes.enabled'));
    }

    public function testAGrantTurnsSelfServiceOnWhereThePanelHasItOff(): void
    {
        config(['pterodactyl.self_service.enabled' => false]);

        $this->assertFalse($this->actingAs($this->makeUser())->getJson('/api/client/self-service')->json('attributes.enabled'));
        $this->assertTrue($this->actingAs($this->userWithRoles(['permissions' => ['self.servers.create']]))->getJson('/api/client/self-service')->json('attributes.enabled'));
    }
}

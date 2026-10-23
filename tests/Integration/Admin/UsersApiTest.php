<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Pterodactyl\Models\User;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

class UsersApiTest extends RoleTestCase
{
    public function testThePagesAreTheApp(): void
    {
        $target = $this->makeUser();
        $this->actingAs($this->userWith(['users.view', 'users.create']));

        foreach (['/admin/users', '/admin/users/new', '/admin/users/view/' . $target->id] as $uri) {
            $this->page($uri)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }

    public function testTheListCanBeSearchedAndShowsRolesAndServers(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $found = $this->makeUser(['username' => 'findmeone']);
        $found->roles()->attach($role->id);
        $this->makeUser(['username' => 'someoneelse']);
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson('/api/client/admin/users?search=findmeone')->assertOk()->json();
        $this->assertSame(['findmeone'], array_column($json['users'], 'username'));
        $this->assertSame(['Helpers'], array_column($json['users'][0]['roles'], 'name'));
        $this->assertSame(0, $json['users'][0]['servers']);
        $this->assertSame(1, $json['pagination']['total']);
        $this->assertStringContainsString('gravatar.com', $json['users'][0]['gravatar']);
        $this->assertSame(['findmeone'], array_column($this->getJson('/api/client/admin/users?search=' . $found->email)->json('users'), 'username'));
    }

    public function testAnAccountIsMadeChangedAndDeleted(): void
    {
        $this->actingAs($this->rootAdmin());
        $data = ['email' => 'made@' . self::DOMAIN, 'username' => 'madeone', 'name_first' => 'Made', 'name_last' => 'One', 'language' => 'en', 'password' => '', 'root_admin' => false];

        $id = $this->postJson('/api/client/admin/users', $data)->assertStatus(201)->json('id');
        $this->assertSame('madeone', User::query()->findOrFail($id)->username);
        $this->postJson('/api/client/admin/users', $data)->assertStatus(422);

        $this->patchJson('/api/client/admin/users/' . $id, array_merge($data, ['name_first' => 'Changed', 'password' => 'a-long-password-1']))->assertOk()->assertJsonPath('name_first', 'Changed');
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('a-long-password-1', User::query()->findOrFail($id)->password));

        $this->deleteJson('/api/client/admin/users/' . $id)->assertNoContent();
        $this->assertNull(User::query()->find($id));
    }

    public function testNobodyDeletesThemselves(): void
    {
        $me = $this->rootAdmin();
        $this->actingAs($me);

        $this->deleteJson('/api/client/admin/users/' . $me->id)->assertStatus(400);
        $this->assertNotNull(User::query()->find($me->id));
    }

    public function testTheViewHasTheRolesThatMayBeGivenAndThePool(): void
    {
        $mine = $this->role(['users.view'], 'Mine');
        $theirs = $this->role(['users.view', 'servers.delete'], 'Theirs');
        $target = $this->makeUser();
        $target->roles()->attach($mine->id);
        $this->actingAs($this->userWith(['users.view', 'roles.view', 'roles.assign']));

        $json = $this->getJson('/api/client/admin/users/' . $target->id)->assertOk()->json();
        $roles = collect($json['roles'])->keyBy('name');
        $this->assertTrue($json['can_change']);
        $this->assertTrue($roles['Mine']['assigned']);
        $this->assertTrue($roles['Mine']['assignable']);
        $this->assertFalse($roles['Theirs']['assignable'], 'a role that holds more than the giver can not be given');
        $this->assertArrayHasKey('en', $json['languages']);
        $this->assertSame(['memory', 'disk', 'cpu', 'allocations', 'backups'], array_keys($json['pool']['limits']));
        $this->assertNull($json['pool']['own']['memory']);
    }

    public function testRolesAreSetFromThePageOfAUser(): void
    {
        $a = $this->role(['users.view'], 'A');
        $b = $this->role(['nodes.view'], 'B');
        $target = $this->makeUser();
        $target->roles()->attach($a->id);
        $this->actingAs($this->rootAdmin());

        $this->putJson('/api/client/admin/users/' . $target->id . '/roles', ['roles' => [$b->id]])->assertOk()->assertJsonPath('roles', [$b->id]);
        $this->putJson('/api/client/admin/users/' . $target->id . '/roles', ['roles' => [999999]])->assertStatus(422);
    }

    public function testThePoolIsSetAndEmptyIsTheDefault(): void
    {
        $target = $this->makeUser();
        $this->actingAs($this->rootAdmin());

        $json = $this->patchJson('/api/client/admin/users/' . $target->id . '/pool', ['memory' => 16384, 'disk' => '', 'cpu' => 800, 'allocations' => 0, 'backups' => 9])->assertOk()->json();
        $this->assertSame(16384, $json['own']['memory']);
        $this->assertNull($json['own']['disk']);
        $this->assertSame(0, $json['own']['allocations']);
        $this->assertSame(16384, $json['limits']['memory']);
        $this->assertSame(9, User::query()->findOrFail($target->id)->pool_backups);
        $this->patchJson('/api/client/admin/users/' . $target->id . '/pool', ['memory' => -1])->assertStatus(422);
    }

    public function testNobodyChangesThePoolOfAStrongerAccount(): void
    {
        $root = $this->rootAdmin();
        $this->actingAs($this->userWith(['users.view', 'users.update']));

        $this->patchJson('/api/client/admin/users/' . $root->id . '/pool', ['memory' => 1])->assertStatus(400);
        $this->assertNull(User::query()->findOrFail($root->id)->pool_memory);
    }

    public function testEachPermissionDoesItsOwnThing(): void
    {
        $target = $this->makeUser();
        $this->actingAs($this->userWith(['users.view']));

        $this->getJson('/api/client/admin/users')->assertOk();
        $this->getJson('/api/client/admin/users/meta')->assertOk()->assertJsonStructure(['languages', 'locale']);
        $this->getJson('/api/client/admin/users/' . $target->id)->assertOk();
        $this->postJson('/api/client/admin/users', ['email' => 'x@' . self::DOMAIN, 'username' => 'xnope', 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en'])->assertStatus(403);
        $this->patchJson('/api/client/admin/users/' . $target->id, ['email' => $target->email, 'username' => $target->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en'])->assertStatus(403);
        $this->deleteJson('/api/client/admin/users/' . $target->id)->assertStatus(403);
        $this->putJson('/api/client/admin/users/' . $target->id . '/roles', ['roles' => []])->assertStatus(403);
        $this->patchJson('/api/client/admin/users/' . $target->id . '/pool', ['memory' => 1])->assertStatus(403);
    }
}

<?php

namespace Pterodactyl\Tests\Integration\Roles;

use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ActivityLog;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;
use Pterodactyl\Services\Roles\PermissionRegistry;

class RolesAdminTest extends RoleTestCase
{
    use CreatesTestModels;

    private function save(array $data = [])
    {
        return $this->postJson('/api/client/admin/roles', array_merge(['name' => 'Support', 'color' => '#ff0000', 'permissions' => ['users.view']], $data));
    }

    // ---- the pages ------------------------------------------------------------------------------------------------------

    public function testThePagesAreTheReactApp(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $this->actingAs($this->rootAdmin());

        foreach (['/admin/roles', '/admin/roles/new', '/admin/roles/view/' . $role->id] as $uri) {
            $this->page($uri)->assertOk()->assertSee('id="app"', false);
        }
    }

    public function testTheListShowsRolesWithTheirMembers(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $role->users()->attach([$this->makeUser()->id, $this->makeUser()->id]);
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson('/api/client/admin/roles')->assertOk()->json();
        $this->assertSame(1, $json['root_admins']);
        $this->assertSame('Helpers', $json['roles'][0]['name']);
        $this->assertSame(2, $json['roles'][0]['users']);
        $this->assertSame(1, $json['roles'][0]['permissions']);
    }

    public function testTheEditorGetsEveryPermissionGrouped(): void
    {
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson('/api/client/admin/roles/permissions')->assertOk()->json();
        $keys = collect($json['groups'])->flatMap(fn ($group) => collect($group['permissions'])->pluck('key'))->all();
        foreach (PermissionRegistry::all() as $permission) {
            $this->assertContains($permission, $keys, $permission);
        }
        foreach (array_keys(PermissionRegistry::user()) as $permission) {
            $this->assertContains($permission, $keys, $permission);
        }
        $this->assertNull($json['mine'], 'root admins hold everything');

        $this->actingAs($this->userWith(['roles.view', 'users.view']));
        $mine = $this->getJson('/api/client/admin/roles/permissions')->json('mine');
        sort($mine);
        $this->assertSame(['roles.view', 'users.view'], $mine);
    }

    public function testAPageShowsWhoHasTheRole(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $member = $this->makeUser(['username' => 'memberone']);
        $role->users()->attach($member->id);
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson('/api/client/admin/roles/' . $role->id)->assertOk()->json();
        $this->assertSame('Helpers', $json['role']['name']);
        $this->assertSame(['users.view'], $json['role']['granted']);
        $this->assertSame(['memberone'], array_column($json['members'], 'username'));
        $this->assertTrue($json['covers']);
    }

    public function testTheUsersListShowsTheirRoles(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $member = $this->makeUser(['username' => 'rolemember']);
        $member->roles()->attach($role->id);
        $this->actingAs($this->rootAdmin());

        $users = $this->getJson('/api/client/admin/users?search=rolemember')->assertOk()->json('users');
        $this->assertSame(['Helpers'], array_column($users[0]['roles'], 'name'));
    }

    // ---- making, changing, deleting -------------------------------------------------------------------------------------

    public function testARoleIsCreatedWithTheViewOfItsGroupAdded(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->save(['permissions' => ['servers.delete', 'nonsense', 'users.update']])->assertStatus(201);

        $role = Role::query()->where('name', 'Support')->firstOrFail();
        $this->assertSame(['users.view', 'users.update', 'servers.view', 'servers.delete'], $role->permissions);
        $this->assertSame('#ff0000', $role->color);
    }

    public function testTheFormIsChecked(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->save(['name' => ''])->assertStatus(422);
        $this->save(['color' => 'red'])->assertStatus(422);
        $this->save(['color' => '#12345'])->assertStatus(422);
        $this->save(['name' => str_repeat('x', 61)])->assertStatus(422);
        $this->save(['permissions' => 'users.view'])->assertStatus(422);
        $this->assertSame(0, Role::query()->count());

        $this->save()->assertStatus(201);
        $this->save()->assertStatus(422);
        $this->assertSame(1, Role::query()->count());
    }

    public function testARoleCanHoldNothing(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->save(['permissions' => []])->assertStatus(201);

        $this->assertSame([], Role::query()->firstOrFail()->permissions);
    }

    public function testARoleIsChanged(): void
    {
        $role = $this->role(['users.view'], 'Old');
        $member = $this->makeUser();
        $member->roles()->attach($role->id);
        $this->actingAs($this->rootAdmin());

        $this->patchJson('/api/client/admin/roles/' . $role->id, ['name' => 'New', 'description' => 'Nice', 'color' => '#00ff00', 'permissions' => ['nodes.view']])
            ->assertOk();

        $role->refresh();
        $this->assertSame('New', $role->name);
        $this->assertSame('Nice', $role->description);
        $this->assertSame(['nodes.view'], $role->permissions);
        $this->assertTrue($member->fresh()->hasPermission('nodes.view'));
        $this->assertFalse($member->fresh()->hasPermission('users.view'));
    }

    public function testARoleKeepsItsNameWhenSaved(): void
    {
        $role = $this->role(['users.view'], 'Same');
        $this->actingAs($this->rootAdmin());

        $this->patchJson('/api/client/admin/roles/' . $role->id, ['name' => 'Same', 'color' => '#000000', 'permissions' => ['users.view']])->assertOk();

        $this->assertSame('#000000', $role->fresh()->color);
    }

    public function testARoleIsDeletedAndItsMembersLoseWhatItGave(): void
    {
        $role = $this->role(['users.view'], 'Gone');
        $member = $this->makeUser();
        $member->roles()->attach($role->id);
        $this->actingAs($this->rootAdmin());

        $this->deleteJson('/api/client/admin/roles/' . $role->id)->assertNoContent();

        $this->assertNull(Role::query()->find($role->id));
        $this->assertFalse($member->fresh()->canAccessAdmin());
        $this->assertNotNull(User::query()->find($member->id), 'the people stay');
    }

    public function testEachRolePermissionDoesItsOwnThing(): void
    {
        $role = $this->role(['users.view'], 'Target');

        $this->actingAs($this->userWith(['roles.view']));
        $this->getJson('/api/client/admin/roles')->assertOk();
        $this->postJson('/api/client/admin/roles', ['name' => 'x', 'color' => '#000000'])->assertStatus(403);
        $this->patchJson('/api/client/admin/roles/' . $role->id, ['name' => 'x', 'color' => '#000000'])->assertStatus(403);
        $this->deleteJson('/api/client/admin/roles/' . $role->id)->assertStatus(403);
        $this->postJson('/api/client/admin/roles/' . $role->id . '/members', ['user' => 'x'])->assertStatus(403);
    }

    public function testChangesAreWrittenToTheActivityLog(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->save(['name' => 'Logged'])->assertStatus(201);

        $this->assertTrue(ActivityLog::query()->where('event', 'role:create')->exists());
    }

    // ---- nobody gets more than they hold --------------------------------------------------------------------------------

    public function testARoleCanOnlyHoldWhatItsMakerHolds(): void
    {
        $maker = $this->userWith(['roles.view', 'roles.create', 'users.view']);
        $this->actingAs($maker);

        $this->save(['name' => 'Too much', 'permissions' => ['users.view', 'servers.delete']]);
        $this->assertNull(Role::query()->where('name', 'Too much')->first());

        $this->save(['name' => 'Fine', 'permissions' => ['users.view']])->assertStatus(201);
        $this->assertNotNull(Role::query()->where('name', 'Fine')->first());
    }

    public function testNobodyGrantsThemselvesMoreByEditingTheirOwnRole(): void
    {
        $maker = $this->makeUser();
        $own = $this->role(['roles.view', 'roles.update', 'users.view'], 'Own');
        $maker->roles()->attach($own->id);
        $this->actingAs($maker->fresh());

        $this->patchJson('/api/client/admin/roles/' . $own->id, ['name' => 'Own', 'color' => '#000000', 'permissions' => ['roles.view', 'roles.update', 'users.view', 'users.delete']]);

        $this->assertNotContains('users.delete', $own->fresh()->permissions);
    }

    public function testARoleThatHoldsMoreCanNotBeChangedOrDeleted(): void
    {
        $strong = $this->role(['users.view', 'servers.delete'], 'Strong');
        $this->actingAs($this->userWith(['roles.view', 'roles.update', 'roles.delete', 'users.view']));

        $this->patchJson('/api/client/admin/roles/' . $strong->id, ['name' => 'Weak', 'color' => '#000000', 'permissions' => ['users.view']]);
        $this->deleteJson('/api/client/admin/roles/' . $strong->id);

        $strong->refresh();
        $this->assertSame('Strong', $strong->name);
        $this->assertContains('servers.delete', $strong->permissions);
    }

    public function testARoleThatHoldsMoreIsOnlyLookedAt(): void
    {
        $strong = $this->role(['users.view', 'servers.delete'], 'Strong');
        $this->actingAs($this->userWith(['roles.view', 'roles.update', 'users.view']));

        $this->getJson('/api/client/admin/roles/' . $strong->id)->assertOk()->assertJsonPath('covers', false);
    }

    // ---- giving roles ---------------------------------------------------------------------------------------------------

    public function testARoleIsGivenAndTakenAway(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $target = $this->makeUser(['username' => 'targetuser']);
        $this->actingAs($this->rootAdmin());

        $this->postJson('/api/client/admin/roles/' . $role->id . '/members', ['user' => 'targetuser'])->assertStatus(201);
        $this->assertTrue($target->fresh()->hasPermission('users.view'));
        $this->assertTrue($role->users()->where('users.id', $target->id)->exists());

        $this->deleteJson('/api/client/admin/roles/' . $role->id . '/members/' . $target->id)->assertNoContent();
        $this->assertFalse($target->fresh()->canAccessAdmin());
    }

    public function testARoleIsGivenByEmailAddressToo(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $target = $this->makeUser(['username' => 'mailtarget']);
        $this->actingAs($this->rootAdmin());

        $this->postJson('/api/client/admin/roles/' . $role->id . '/members', ['user' => $target->email])->assertStatus(201);

        $this->assertTrue($target->fresh()->canAccessAdmin());
    }

    public function testGivingTheSameRoleTwiceIsFine(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $target = $this->makeUser(['username' => 'twice']);
        $this->actingAs($this->rootAdmin());

        $this->postJson('/api/client/admin/roles/' . $role->id . '/members', ['user' => 'twice']);
        $this->postJson('/api/client/admin/roles/' . $role->id . '/members', ['user' => 'twice']);

        $this->assertSame(1, $role->users()->count());
    }

    public function testNobodyGivesARoleToSomebodyWhoDoesNotExist(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $this->actingAs($this->rootAdmin());

        $this->postJson('/api/client/admin/roles/' . $role->id . '/members', ['user' => 'nobody-by-that-name']);

        $this->assertSame(0, $role->users()->count());
    }

    public function testARoleIsGivenFromThePageOfAUser(): void
    {
        $a = $this->role(['users.view'], 'A');
        $b = $this->role(['nodes.view'], 'B');
        $target = $this->makeUser();
        $target->roles()->attach($a->id);
        $this->actingAs($this->rootAdmin());

        $this->putJson('/api/client/admin/users/' . $target->id . '/roles', ['roles' => [$b->id]])->assertOk();

        $this->assertSame([$b->id], $target->roles()->pluck('roles.id')->all());
        $this->putJson('/api/client/admin/users/' . $target->id . '/roles', [])->assertOk();
        $this->assertSame(0, $target->roles()->count());
    }

    public function testOnlyRolesThatExistAreGiven(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->putJson('/api/client/admin/users/' . $this->makeUser()->id . '/roles', ['roles' => [999999]])->assertStatus(422);
    }

    public function testNobodyGivesARoleWithoutThePermissionToGiveRoles(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $target = $this->makeUser(['username' => 'untouched']);
        $this->actingAs($this->userWith(['roles.view', 'roles.update', 'users.view']));

        $this->putJson('/api/client/admin/users/' . $target->id . '/roles', ['roles' => [$role->id]])->assertStatus(403);
        $this->postJson('/api/client/admin/roles/' . $role->id . '/members', ['user' => 'untouched'])->assertStatus(403);
        $this->assertSame(0, $target->roles()->count());
    }

    public function testNobodyGivesARoleThatHoldsMoreThanTheyDo(): void
    {
        $strong = $this->role(['users.view', 'servers.delete'], 'Strong');
        $target = $this->makeUser(['username' => 'wouldgrow']);
        $this->actingAs($this->userWith(['roles.view', 'roles.assign', 'users.view']));

        $this->putJson('/api/client/admin/users/' . $target->id . '/roles', ['roles' => [$strong->id]]);
        $this->postJson('/api/client/admin/roles/' . $strong->id . '/members', ['user' => 'wouldgrow']);

        $this->assertSame(0, $target->roles()->count());
    }

    public function testNobodyGivesThemselvesAStrongerRole(): void
    {
        $strong = $this->role(['users.view', 'servers.delete'], 'Strong');
        $me = $this->userWith(['roles.view', 'roles.assign', 'users.view']);
        $this->actingAs($me);

        $this->putJson('/api/client/admin/users/' . $me->id . '/roles', ['roles' => [$strong->id]]);

        $this->assertFalse($me->fresh()->hasPermission('servers.delete'));
    }

    public function testNobodyChangesTheRolesOfARootAdminOrOfSomebodyStronger(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $root = $this->rootAdmin();
        $stronger = $this->userWith(['users.view', 'servers.delete']);
        $this->actingAs($this->userWith(['roles.view', 'roles.assign', 'users.view']));

        $this->putJson('/api/client/admin/users/' . $root->id . '/roles', ['roles' => [$role->id]]);
        $this->putJson('/api/client/admin/users/' . $stronger->id . '/roles', ['roles' => []]);

        $this->assertSame(0, $root->roles()->count());
        $this->assertSame(1, $stronger->roles()->count());
    }

    public function testRolesThatTheGiverMayNotTouchStayWhenTheRestIsSet(): void
    {
        $mine = $this->role(['users.view'], 'Mine');
        $theirs = $this->role(['users.view', 'servers.delete'], 'Theirs');
        $target = $this->makeUser();
        $target->roles()->attach($theirs->id);
        $this->actingAs($this->userWith(['roles.view', 'roles.assign', 'users.view', 'servers.delete']));

        // A giver who holds everything can touch both, one who does not would leave "Theirs" alone.
        $this->putJson('/api/client/admin/users/' . $target->id . '/roles', ['roles' => [$mine->id]])->assertOk();

        $this->assertSame([$mine->id], $target->roles()->pluck('roles.id')->all());
    }

    // ---- accounts -------------------------------------------------------------------------------------------------------

    public function testOnlyRootAdminsMakeRootAdmins(): void
    {
        $target = $this->makeUser();
        $this->actingAs($this->userWith(['users.view', 'users.update']));

        $this->patchJson('/api/client/admin/users/' . $target->id, ['email' => $target->email, 'username' => $target->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en', 'root_admin' => true])->assertOk();

        $this->assertFalse($target->fresh()->root_admin);
    }

    public function testRootAdminsMakeRootAdmins(): void
    {
        $target = $this->makeUser();
        $this->actingAs($this->rootAdmin());

        $this->patchJson('/api/client/admin/users/' . $target->id, ['email' => $target->email, 'username' => $target->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en', 'root_admin' => true])->assertOk();

        $this->assertTrue($target->fresh()->root_admin);
    }

    public function testNobodyCreatesARootAdminWithoutBeingOne(): void
    {
        $this->actingAs($this->userWith(['users.view', 'users.create']));

        $this->postJson('/api/client/admin/users', ['email' => 'created@' . self::DOMAIN, 'username' => 'createdone', 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en', 'root_admin' => true, 'password' => ''])->assertStatus(201);

        $created = User::query()->where('username', 'createdone')->first();
        $this->assertNotNull($created);
        $this->assertFalse($created->root_admin);
    }

    public function testNobodyChangesOrDeletesARootAdmin(): void
    {
        $root = $this->rootAdmin();
        $before = $root->email;
        $this->actingAs($this->userWith(['users.view', 'users.update', 'users.delete']));

        $this->patchJson('/api/client/admin/users/' . $root->id, ['email' => 'taken@' . self::DOMAIN, 'username' => $root->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en', 'password' => 'a-new-password-1']);
        $this->deleteJson('/api/client/admin/users/' . $root->id);

        $this->assertSame($before, $root->fresh()->email);
        $this->assertNotNull(User::query()->find($root->id));
    }

    public function testNobodyChangesAnAccountThatHoldsMore(): void
    {
        $stronger = $this->userWith(['users.view', 'servers.delete']);
        $this->actingAs($this->userWith(['users.view', 'users.update', 'users.delete']));

        $this->patchJson('/api/client/admin/users/' . $stronger->id, ['email' => 'hijack@' . self::DOMAIN, 'username' => $stronger->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en']);
        $this->deleteJson('/api/client/admin/users/' . $stronger->id);

        $this->assertNotSame('hijack@' . self::DOMAIN, $stronger->fresh()->email);
        $this->assertNotNull(User::query()->find($stronger->id));
    }

    public function testSomebodyMayChangeAnAccountThatHoldsNoMore(): void
    {
        $weaker = $this->userWith(['users.view']);
        $this->actingAs($this->userWith(['users.view', 'users.update', 'servers.view']));

        $this->patchJson('/api/client/admin/users/' . $weaker->id, ['email' => $weaker->email, 'username' => $weaker->username, 'name_first' => 'Changed', 'name_last' => 'B', 'language' => 'en'])->assertOk();

        $this->assertSame('Changed', $weaker->fresh()->name_first);
    }

    public function testTheUserPageSaysWhatThePersonMayChange(): void
    {
        $target = $this->makeUser();
        $root = $this->rootAdmin();
        $this->actingAs($this->userWith(['users.view', 'users.update']));

        $this->assertTrue($this->getJson('/api/client/admin/users/' . $target->id)->assertOk()->json('can_change'));
        $this->assertFalse($this->getJson('/api/client/admin/users/' . $root->id)->assertOk()->json('can_change'), 'a root admin can only be looked at');
    }

    // ---- servers --------------------------------------------------------------------------------------------------------

    private function serverOf(User $owner): Server
    {
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();

        return $this->createServerModel(['user_id' => $owner->id, 'egg_id' => $egg->id, 'nest_id' => $egg->nest_id]);
    }

    public function testOpeningEveryServerIsAPermissionOfItsOwn(): void
    {
        $server = $this->serverOf($this->makeUser());

        $this->actingAs($this->userWith(['servers.view', 'servers.delete', 'users.view']))->getJson('/api/client/servers/' . $server->uuid)->assertNotFound();

        $this->signOut();
        $this->actingAs($this->userWith(['servers.access']))->getJson('/api/client/servers/' . $server->uuid)->assertOk();

        $this->signOut();
        $this->actingAs($this->makeUser())->getJson('/api/client/servers/' . $server->uuid)->assertNotFound();
    }

    public function testEveryServerIsInTheListOfSomebodyWithThePermission(): void
    {
        $server = $this->serverOf($this->makeUser());
        $this->actingAs($this->userWith(['servers.access']));

        $ids = collect($this->getJson('/api/client?type=admin-all')->assertOk()->json('data'))->pluck('attributes.uuid');
        $this->assertTrue($ids->contains($server->uuid));

        $this->signOut();
        $this->actingAs($this->userWith(['servers.view']));
        $this->assertCount(0, $this->getJson('/api/client?type=admin-all')->assertOk()->json('data'));
    }
}

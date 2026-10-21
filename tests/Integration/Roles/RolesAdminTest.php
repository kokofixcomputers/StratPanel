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
        return $this->post('/admin/roles/new', array_merge(['name' => 'Support', 'color' => '#ff0000', 'permissions' => ['users.view']], $data));
    }

    // ---- the pages ------------------------------------------------------------------------------------------------------

    public function testTheListShowsRolesWithTheirMembers(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $role->users()->attach([$this->makeUser()->id, $this->makeUser()->id]);
        $this->actingAs($this->rootAdmin());

        $this->page('/admin/roles')->assertOk()->assertSee('Helpers')->assertSee('Root admin');
    }

    public function testTheEditorShowsEveryPermissionGrouped(): void
    {
        $this->actingAs($this->rootAdmin());

        $html = $this->page('/admin/roles/new')->assertOk()->getContent();
        foreach (PermissionRegistry::all() as $permission) {
            $this->assertStringContainsString('name="states[' . $permission . ']"', $html, $permission);
        }
        foreach (PermissionRegistry::groups() as $group) {
            $this->assertStringContainsString($group['label'], $html);
        }
    }

    public function testAPageShowsWhoHasTheRole(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $member = $this->makeUser(['username' => 'memberone']);
        $role->users()->attach($member->id);
        $this->actingAs($this->rootAdmin());

        $this->page('/admin/roles/view/' . $role->id)->assertOk()->assertSee('memberone')->assertSee('People with this role');
    }

    public function testTheUsersListShowsTheirRoles(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $member = $this->makeUser(['username' => 'rolemember']);
        $member->roles()->attach($role->id);
        $this->actingAs($this->rootAdmin());

        $this->page('/admin/users?filter[username]=rolemember')->assertOk()->assertSee('Helpers');
    }

    // ---- making, changing, deleting -------------------------------------------------------------------------------------

    public function testARoleIsCreatedWithTheViewOfItsGroupAdded(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->save(['permissions' => ['servers.delete', 'nonsense', 'users.update']])->assertRedirect();

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

        $this->save()->assertRedirect();
        $this->save()->assertStatus(422);
        $this->assertSame(1, Role::query()->count());
    }

    public function testARoleCanHoldNothing(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->save(['permissions' => []])->assertRedirect();

        $this->assertSame([], Role::query()->firstOrFail()->permissions);
    }

    public function testARoleIsChanged(): void
    {
        $role = $this->role(['users.view'], 'Old');
        $member = $this->makeUser();
        $member->roles()->attach($role->id);
        $this->actingAs($this->rootAdmin());

        $this->patch('/admin/roles/view/' . $role->id, ['name' => 'New', 'description' => 'Nice', 'color' => '#00ff00', 'permissions' => ['nodes.view']])
            ->assertRedirect('/admin/roles/view/' . $role->id);

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

        $this->patch('/admin/roles/view/' . $role->id, ['name' => 'Same', 'color' => '#000000', 'permissions' => ['users.view']])->assertRedirect();

        $this->assertSame('#000000', $role->fresh()->color);
    }

    public function testARoleIsDeletedAndItsMembersLoseWhatItGave(): void
    {
        $role = $this->role(['users.view'], 'Gone');
        $member = $this->makeUser();
        $member->roles()->attach($role->id);
        $this->actingAs($this->rootAdmin());

        $this->delete('/admin/roles/view/' . $role->id)->assertRedirect('/admin/roles');

        $this->assertNull(Role::query()->find($role->id));
        $this->assertFalse($member->fresh()->canAccessAdmin());
        $this->assertNotNull(User::query()->find($member->id), 'the people stay');
    }

    public function testEachRolePermissionDoesItsOwnThing(): void
    {
        $role = $this->role(['users.view'], 'Target');

        $this->actingAs($this->userWith(['roles.view']));
        $this->page('/admin/roles')->assertOk();
        $this->post('/admin/roles/new', ['name' => 'x', 'color' => '#000000'])->assertStatus(403);
        $this->patch('/admin/roles/view/' . $role->id, ['name' => 'x', 'color' => '#000000'])->assertStatus(403);
        $this->delete('/admin/roles/view/' . $role->id)->assertStatus(403);
        $this->post('/admin/roles/view/' . $role->id . '/members', ['user' => 'x'])->assertStatus(403);
    }

    public function testChangesAreWrittenToTheActivityLog(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->save(['name' => 'Logged'])->assertRedirect();

        $this->assertTrue(ActivityLog::query()->where('event', 'role:create')->exists());
    }

    // ---- nobody gets more than they hold --------------------------------------------------------------------------------

    public function testARoleCanOnlyHoldWhatItsMakerHolds(): void
    {
        $maker = $this->userWith(['roles.view', 'roles.create', 'users.view']);
        $this->actingAs($maker);

        $this->save(['name' => 'Too much', 'permissions' => ['users.view', 'servers.delete']]);
        $this->assertNull(Role::query()->where('name', 'Too much')->first());

        $this->save(['name' => 'Fine', 'permissions' => ['users.view']])->assertRedirect();
        $this->assertNotNull(Role::query()->where('name', 'Fine')->first());
    }

    public function testNobodyGrantsThemselvesMoreByEditingTheirOwnRole(): void
    {
        $maker = $this->makeUser();
        $own = $this->role(['roles.view', 'roles.update', 'users.view'], 'Own');
        $maker->roles()->attach($own->id);
        $this->actingAs($maker->fresh());

        $this->patch('/admin/roles/view/' . $own->id, ['name' => 'Own', 'color' => '#000000', 'permissions' => ['roles.view', 'roles.update', 'users.view', 'users.delete']]);

        $this->assertNotContains('users.delete', $own->fresh()->permissions);
    }

    public function testARoleThatHoldsMoreCanNotBeChangedOrDeleted(): void
    {
        $strong = $this->role(['users.view', 'servers.delete'], 'Strong');
        $this->actingAs($this->userWith(['roles.view', 'roles.update', 'roles.delete', 'users.view']));

        $this->patch('/admin/roles/view/' . $strong->id, ['name' => 'Weak', 'color' => '#000000', 'permissions' => ['users.view']]);
        $this->delete('/admin/roles/view/' . $strong->id);

        $strong->refresh();
        $this->assertSame('Strong', $strong->name);
        $this->assertContains('servers.delete', $strong->permissions);
    }

    public function testARoleThatHoldsMoreIsOnlyLookedAt(): void
    {
        $strong = $this->role(['users.view', 'servers.delete'], 'Strong');
        $this->actingAs($this->userWith(['roles.view', 'roles.update', 'users.view']));

        $this->page('/admin/roles/view/' . $strong->id)->assertOk()->assertSee('you can look at it but not change it');
    }

    // ---- giving roles ---------------------------------------------------------------------------------------------------

    public function testARoleIsGivenAndTakenAway(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $target = $this->makeUser(['username' => 'targetuser']);
        $this->actingAs($this->rootAdmin());

        $this->post('/admin/roles/view/' . $role->id . '/members', ['user' => 'targetuser'])->assertRedirect();
        $this->assertTrue($target->fresh()->hasPermission('users.view'));
        $this->assertTrue($role->users()->where('users.id', $target->id)->exists());

        $this->delete('/admin/roles/view/' . $role->id . '/members/' . $target->id)->assertRedirect();
        $this->assertFalse($target->fresh()->canAccessAdmin());
    }

    public function testARoleIsGivenByEmailAddressToo(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $target = $this->makeUser(['username' => 'mailtarget']);
        $this->actingAs($this->rootAdmin());

        $this->post('/admin/roles/view/' . $role->id . '/members', ['user' => $target->email])->assertRedirect();

        $this->assertTrue($target->fresh()->canAccessAdmin());
    }

    public function testGivingTheSameRoleTwiceIsFine(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $target = $this->makeUser(['username' => 'twice']);
        $this->actingAs($this->rootAdmin());

        $this->post('/admin/roles/view/' . $role->id . '/members', ['user' => 'twice']);
        $this->post('/admin/roles/view/' . $role->id . '/members', ['user' => 'twice']);

        $this->assertSame(1, $role->users()->count());
    }

    public function testNobodyGivesARoleToSomebodyWhoDoesNotExist(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $this->actingAs($this->rootAdmin());

        $this->post('/admin/roles/view/' . $role->id . '/members', ['user' => 'nobody-by-that-name']);

        $this->assertSame(0, $role->users()->count());
    }

    public function testARoleIsGivenFromThePageOfAUser(): void
    {
        $a = $this->role(['users.view'], 'A');
        $b = $this->role(['nodes.view'], 'B');
        $target = $this->makeUser();
        $target->roles()->attach($a->id);
        $this->actingAs($this->rootAdmin());

        $this->post('/admin/roles/users/' . $target->id, ['roles' => [$b->id]])->assertRedirect('/admin/users/view/' . $target->id);

        $this->assertSame([$b->id], $target->roles()->pluck('roles.id')->all());
        $this->post('/admin/roles/users/' . $target->id, [])->assertRedirect();
        $this->assertSame(0, $target->roles()->count());
    }

    public function testOnlyRolesThatExistAreGiven(): void
    {
        $this->actingAs($this->rootAdmin());

        $this->post('/admin/roles/users/' . $this->makeUser()->id, ['roles' => [999999]])->assertStatus(422);
    }

    public function testNobodyGivesARoleWithoutThePermissionToGiveRoles(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $target = $this->makeUser(['username' => 'untouched']);
        $this->actingAs($this->userWith(['roles.view', 'roles.update', 'users.view']));

        $this->post('/admin/roles/view/' . $role->id . '/members', ['user' => 'untouched'])->assertStatus(403);
        $this->post('/admin/roles/users/' . $target->id, ['roles' => [$role->id]])->assertStatus(403);
        $this->assertSame(0, $target->roles()->count());
    }

    public function testNobodyGivesARoleThatHoldsMoreThanTheyDo(): void
    {
        $strong = $this->role(['users.view', 'servers.delete'], 'Strong');
        $target = $this->makeUser(['username' => 'wouldgrow']);
        $this->actingAs($this->userWith(['roles.view', 'roles.assign', 'users.view']));

        $this->post('/admin/roles/view/' . $strong->id . '/members', ['user' => 'wouldgrow']);
        $this->post('/admin/roles/users/' . $target->id, ['roles' => [$strong->id]]);

        $this->assertSame(0, $target->roles()->count());
    }

    public function testNobodyGivesThemselvesAStrongerRole(): void
    {
        $strong = $this->role(['users.view', 'servers.delete'], 'Strong');
        $me = $this->userWith(['roles.view', 'roles.assign', 'users.view']);
        $this->actingAs($me);

        $this->post('/admin/roles/users/' . $me->id, ['roles' => [$strong->id]]);

        $this->assertFalse($me->fresh()->hasPermission('servers.delete'));
    }

    public function testNobodyChangesTheRolesOfARootAdminOrOfSomebodyStronger(): void
    {
        $role = $this->role(['users.view'], 'Helpers');
        $root = $this->rootAdmin();
        $stronger = $this->userWith(['users.view', 'servers.delete']);
        $this->actingAs($this->userWith(['roles.view', 'roles.assign', 'users.view']));

        $this->post('/admin/roles/users/' . $root->id, ['roles' => [$role->id]]);
        $this->post('/admin/roles/users/' . $stronger->id, ['roles' => []]);

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
        $this->post('/admin/roles/users/' . $target->id, ['roles' => [$mine->id]])->assertRedirect();

        $this->assertSame([$mine->id], $target->roles()->pluck('roles.id')->all());
    }

    // ---- accounts -------------------------------------------------------------------------------------------------------

    public function testOnlyRootAdminsMakeRootAdmins(): void
    {
        $target = $this->makeUser();
        $this->actingAs($this->userWith(['users.view', 'users.update']));

        $this->patch('/admin/users/view/' . $target->id, ['email' => $target->email, 'username' => $target->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en', 'root_admin' => '1'])->assertRedirect();

        $this->assertFalse($target->fresh()->root_admin);
    }

    public function testRootAdminsMakeRootAdmins(): void
    {
        $target = $this->makeUser();
        $this->actingAs($this->rootAdmin());

        $this->patch('/admin/users/view/' . $target->id, ['email' => $target->email, 'username' => $target->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en', 'root_admin' => '1'])->assertRedirect();

        $this->assertTrue($target->fresh()->root_admin);
    }

    public function testNobodyCreatesARootAdminWithoutBeingOne(): void
    {
        $this->actingAs($this->userWith(['users.view', 'users.create']));

        $this->post('/admin/users/new', ['email' => 'created@' . self::DOMAIN, 'username' => 'createdone', 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en', 'root_admin' => '1', 'password' => ''])->assertRedirect();

        $created = User::query()->where('username', 'createdone')->first();
        $this->assertNotNull($created);
        $this->assertFalse($created->root_admin);
    }

    public function testNobodyChangesOrDeletesARootAdmin(): void
    {
        $root = $this->rootAdmin();
        $before = $root->email;
        $this->actingAs($this->userWith(['users.view', 'users.update', 'users.delete']));

        $this->patch('/admin/users/view/' . $root->id, ['email' => 'taken@' . self::DOMAIN, 'username' => $root->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en', 'password' => 'a-new-password-1']);
        $this->delete('/admin/users/view/' . $root->id);

        $this->assertSame($before, $root->fresh()->email);
        $this->assertNotNull(User::query()->find($root->id));
    }

    public function testNobodyChangesAnAccountThatHoldsMore(): void
    {
        $stronger = $this->userWith(['users.view', 'servers.delete']);
        $this->actingAs($this->userWith(['users.view', 'users.update', 'users.delete']));

        $this->patch('/admin/users/view/' . $stronger->id, ['email' => 'hijack@' . self::DOMAIN, 'username' => $stronger->username, 'name_first' => 'A', 'name_last' => 'B', 'language' => 'en']);
        $this->delete('/admin/users/view/' . $stronger->id);

        $this->assertNotSame('hijack@' . self::DOMAIN, $stronger->fresh()->email);
        $this->assertNotNull(User::query()->find($stronger->id));
    }

    public function testSomebodyMayChangeAnAccountThatHoldsNoMore(): void
    {
        $weaker = $this->userWith(['users.view']);
        $this->actingAs($this->userWith(['users.view', 'users.update', 'servers.view']));

        $this->patch('/admin/users/view/' . $weaker->id, ['email' => $weaker->email, 'username' => $weaker->username, 'name_first' => 'Changed', 'name_last' => 'B', 'language' => 'en'])->assertRedirect();

        $this->assertSame('Changed', $weaker->fresh()->name_first);
    }

    public function testTheUserPageShowsTheRootAdminFieldOnlyToRootAdmins(): void
    {
        $target = $this->makeUser();

        $this->actingAs($this->userWith(['users.view', 'users.update']));
        $this->page('/admin/users/view/' . $target->id)->assertOk()->assertDontSee('name="root_admin"', false)->assertSee('Only root admins make root admins');

        $this->signOut();
        $this->actingAs($this->rootAdmin());
        $this->page('/admin/users/view/' . $target->id)->assertOk()->assertSee('name="root_admin"', false);
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

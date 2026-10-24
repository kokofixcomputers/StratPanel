<?php

namespace Pterodactyl\Tests\Integration\Http\Controllers\Admin\UserController;

use Pterodactyl\Models\User;
use Pterodactyl\Tests\Integration\Http\HttpTestCase;

class CreateUserTest extends HttpTestCase
{
    public function testNonAdminCannotAccessEndpoint(): void
    {
        $this->actingAs(User::factory()->create())
            ->postJson('/api/client/admin/users', [
                'email' => 'test@example.com',
                'username' => 'testuser',
                'name_first' => 'Test',
                'name_last' => 'User',
                'language' => 'en',
            ])
            ->assertForbidden();
    }

    public function testCreatingAdministratorAccountIsLogged(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->postJson('/api/client/admin/users', [
                'email' => 'created.admin@example.com',
                'username' => 'createdadmin',
                'name_first' => 'Created',
                'name_last' => 'Admin',
                'language' => 'en',
                'root_admin' => 1,
            ])
            ->assertStatus(201);

        /** @var User $created */
        $created = User::query()->where('username', 'createdadmin')->firstOrFail();
        $this->assertTrue($created->root_admin);

        $this->assertActivityFor('user:user.create', $admin, $created);
    }
}

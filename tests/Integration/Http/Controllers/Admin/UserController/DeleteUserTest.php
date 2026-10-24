<?php

namespace Pterodactyl\Tests\Integration\Http\Controllers\Admin\UserController;

use Pterodactyl\Models\User;
use Pterodactyl\Tests\Integration\Http\HttpTestCase;

class DeleteUserTest extends HttpTestCase
{
    public function testNonAdminCannotAccessEndpoint(): void
    {
        $this->actingAs(User::factory()->create())
            ->deleteJson('/api/client/admin/users/' . User::factory()->create()->id)
            ->assertForbidden();
    }

    public function testCannotDeleteSelf(): void
    {
        $this->actingAs($user = User::factory()->admin()->create())
            ->deleteJson('/api/client/admin/users/' . $user->id)
            ->assertBadRequest()
            ->assertJsonPath('errors.0.detail', __('admin/user.exceptions.delete_self'));

        $this->assertModelExists($user);
    }

    public function testUserIsDeleted(): void
    {
        $user = User::factory()->create();

        $this->actingAs(User::factory()->admin()->create())
            ->deleteJson('/api/client/admin/users/' . $user->id)
            ->assertNoContent();

        $this->assertModelMissing($user);
    }
}

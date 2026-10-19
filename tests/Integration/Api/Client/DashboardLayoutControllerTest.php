<?php

namespace Pterodactyl\Tests\Integration\Api\Client;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\DashboardFolder;

class DashboardLayoutControllerTest extends ClientApiIntegrationTestCase
{
    public function setUp(): void
    {
        parent::setUp();

        // The test helpers build servers on the BungeeCord egg, which this panel does not ship: borrow the first egg for it.
        if (!Egg::query()->where('author', 'support@pterodactyl.io')->where('name', 'Bungeecord')->exists()) {
            $egg = Egg::query()->firstOrFail()->replicate();
            $egg->forceFill(['uuid' => (string) \Illuminate\Support\Str::uuid(), 'author' => 'support@pterodactyl.io', 'name' => 'Bungeecord'])->save();
        }
    }

    public function testFoldersAndStarsAreKeptPerUser()
    {
        [$user, $server] = $this->generateTestAccount();
        [$other] = $this->generateTestAccount();

        $this->actingAs($user);
        $this->getJson('/api/client/dashboard')->assertOk()->assertJsonPath('attributes.folders', [])->assertJsonPath('attributes.servers', []);

        $layout = $this->postJson('/api/client/dashboard/folders', ['name' => 'Survival'])->assertOk();
        $id = $layout->json('attributes.folders.0.id');
        $layout->assertJsonPath('attributes.folders.0.name', 'Survival');

        $this->putJson("/api/client/dashboard/servers/{$server->uuid}", ['folder' => $id, 'starred' => true])
            ->assertOk()
            ->assertJsonPath('attributes.servers.0.uuid', $server->uuid)
            ->assertJsonPath('attributes.servers.0.folder', $id)
            ->assertJsonPath('attributes.servers.0.starred', true);

        // Only what is sent changes.
        $this->putJson("/api/client/dashboard/servers/{$server->uuid}", ['starred' => false])
            ->assertJsonPath('attributes.servers.0.folder', $id)
            ->assertJsonPath('attributes.servers.0.starred', false);

        // Somebody else sees none of it and cannot use it.
        $this->actingAs($other);
        $this->getJson('/api/client/dashboard')->assertJsonPath('attributes.folders', []);
        $this->putJson("/api/client/dashboard/servers/{$server->uuid}", ['starred' => true])->assertNotFound();
        $this->patchJson("/api/client/dashboard/folders/{$id}", ['name' => 'Mine'])->assertNotFound();
        $this->deleteJson("/api/client/dashboard/folders/{$id}")->assertNotFound();
    }

    public function testFolderCanBeRenamedAndDeletedAndServersStay()
    {
        [$user, $server] = $this->generateTestAccount();
        $this->actingAs($user);

        $id = $this->postJson('/api/client/dashboard/folders', ['name' => 'A'])->json('attributes.folders.0.id');
        $this->postJson('/api/client/dashboard/folders', ['name' => 'A'])->assertUnprocessable();
        $this->patchJson("/api/client/dashboard/folders/{$id}", ['name' => 'B'])->assertJsonPath('attributes.folders.0.name', 'B');
        $this->putJson("/api/client/dashboard/servers/{$server->uuid}", ['folder' => $id, 'starred' => true]);

        $this->deleteJson("/api/client/dashboard/folders/{$id}")
            ->assertOk()
            ->assertJsonPath('attributes.folders', [])
            ->assertJsonPath('attributes.servers.0.folder', null)
            ->assertJsonPath('attributes.servers.0.starred', true);
    }

    public function testAServerCannotGoInSomeoneElsesFolder()
    {
        [$user, $server] = $this->generateTestAccount();
        [$other] = $this->generateTestAccount();

        $this->actingAs($other);
        $theirs = $this->postJson('/api/client/dashboard/folders', ['name' => 'X'])->json('attributes.folders.0.id');

        $this->actingAs($user);
        $this->putJson("/api/client/dashboard/servers/{$server->uuid}", ['folder' => $theirs])->assertNotFound();
        $this->assertSame(0, \Pterodactyl\Models\DashboardServerPref::query()->count());
    }

    public function testFoldersCanBeReordered()
    {
        [$user] = $this->generateTestAccount();
        $this->actingAs($user);

        $a = $this->postJson('/api/client/dashboard/folders', ['name' => 'A'])->json('attributes.folders.0.id');
        $layout = $this->postJson('/api/client/dashboard/folders', ['name' => 'B']);
        $b = $layout->json('attributes.folders.1.id');

        $this->postJson('/api/client/dashboard/folders/order', ['order' => [$b, $a]])
            ->assertJsonPath('attributes.folders.0.name', 'B')
            ->assertJsonPath('attributes.folders.1.name', 'A');
    }

    public function testNumberOfFoldersIsLimited()
    {
        [$user] = $this->generateTestAccount();
        $this->actingAs($user);

        for ($i = 0; $i < DashboardFolder::MAX_PER_USER; ++$i) {
            DashboardFolder::query()->create(['user_id' => $user->id, 'name' => "F$i", 'position' => $i]);
        }
        $this->postJson('/api/client/dashboard/folders', ['name' => 'One more'])->assertUnprocessable();
    }
}

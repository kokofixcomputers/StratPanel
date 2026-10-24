<?php

namespace Pterodactyl\Tests\Integration\Admin;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Illuminate\Http\UploadedFile;
use Pterodactyl\Models\EggVariable;
use Pterodactyl\Tests\Integration\Roles\RoleTestCase;

class NestsApiTest extends RoleTestCase
{
    public function setUp(): void
    {
        parent::setUp();

        $this->clean();
    }

    public function tearDown(): void
    {
        $this->clean();

        parent::tearDown();
    }

    private function clean(): void
    {
        Nest::query()->where('name', 'like', 'apitest%')->delete();
    }

    private function nest(string $name = 'apitest nest'): Nest
    {
        return Nest::factory()->create(['name' => $name]);
    }

    private function egg(Nest $nest, array $patch = []): Egg
    {
        return Egg::factory()->create(array_merge(['nest_id' => $nest->id, 'name' => 'apitest egg', 'author' => 'test@example.com', 'docker_images' => ['Java 21' => 'ghcr.io/example/java:21'], 'config_stop' => '^C', 'config_startup' => '{"done": "Done"}', 'config_logs' => '{}', 'config_files' => '{}'], $patch));
    }

    /** @return array<string, mixed> */
    private function eggInput(Nest $nest, array $patch = []): array
    {
        return array_merge([
            'nest_id' => $nest->id, 'name' => 'apitest made', 'description' => 'A test egg', 'docker_images' => "Java 21|ghcr.io/example/java:21\nghcr.io/example/other",
            'startup' => 'java -jar server.jar', 'features' => ['eula'], 'force_outgoing_ip' => false, 'config_from' => null,
            'config_stop' => 'stop', 'config_startup' => '{"done": "Done"}', 'config_logs' => '{}', 'config_files' => '{}',
        ], $patch);
    }

    public function testThePagesAreTheApp(): void
    {
        $nest = $this->nest();
        $egg = $this->egg($nest);
        $this->actingAs($this->userWith(['nests.view', 'eggs.create']));

        foreach (['/admin/nests', '/admin/nests/view/' . $nest->id, '/admin/nests/egg/new', '/admin/nests/egg/' . $egg->id, '/admin/nests/egg/' . $egg->id . '/variables', '/admin/nests/egg/' . $egg->id . '/scripts'] as $uri) {
            $this->get($uri)->assertOk()->assertSee('<div id="app"></div>', false);
        }
    }

    public function testANestIsMadeChangedListedAndDeleted(): void
    {
        $this->actingAs($this->rootAdmin());

        $id = $this->postJson('/api/client/admin/nests', ['name' => 'apitest made', 'description' => 'Games'])->assertStatus(201)->assertJsonPath('name', 'apitest made')->json('id');
        $this->postJson('/api/client/admin/nests', ['name' => 'bad name!'])->assertStatus(422);

        $this->patchJson('/api/client/admin/nests/' . $id, ['name' => 'apitest renamed', 'description' => 'More'])->assertOk()->assertJsonPath('name', 'apitest renamed');
        $rows = collect($this->getJson('/api/client/admin/nests')->assertOk()->json('nests'));
        $this->assertSame(0, $rows->firstWhere('id', $id)['eggs']);

        $this->deleteJson('/api/client/admin/nests/' . $id)->assertNoContent();
        $this->assertNull(Nest::query()->find($id));
    }

    public function testTheLookupHasEveryNestWithItsEggs(): void
    {
        $nest = $this->nest();
        $egg = $this->egg($nest);
        $this->actingAs($this->userWith(['eggs.create']));

        $found = collect($this->getJson('/api/client/admin/nests/lookup')->assertOk()->json('nests'))->firstWhere('id', $nest->id);
        $this->assertSame([$egg->id], array_column($found['eggs'], 'id'));
    }

    public function testAnEggIsMadeChangedAndDeleted(): void
    {
        $nest = $this->nest();
        $other = $this->egg($nest, ['name' => 'apitest other']);
        $this->actingAs($this->rootAdmin());

        $json = $this->postJson('/api/client/admin/eggs', $this->eggInput($nest))->assertStatus(201)->json();
        $this->assertSame("Java 21|ghcr.io/example/java:21\nghcr.io/example/other", $json['docker_images']);
        $this->assertSame(['eula'], $json['features']);
        $this->assertSame($nest->id, $json['nest']['id']);
        $this->assertSame([$other->id], array_column($json['siblings'], 'id'));
        $this->assertStringContainsString('"done": "Done"', $json['config_startup']);

        $id = $json['id'];
        $this->patchJson('/api/client/admin/eggs/' . $id, $this->eggInput($nest, ['name' => 'apitest changed', 'config_from' => $other->id, 'config_stop' => '', 'config_startup' => '', 'config_logs' => '', 'config_files' => '']))
            ->assertOk()->assertJsonPath('name', 'apitest changed')->assertJsonPath('config_from', $other->id);
        $this->patchJson('/api/client/admin/eggs/' . $id, $this->eggInput($nest, ['docker_images' => '', 'name' => 'apitest changed']))->assertStatus(422);
        $this->postJson('/api/client/admin/eggs', $this->eggInput($nest, ['config_startup' => 'not json']))->assertStatus(422);

        // The one that is copied from can not go while another copies it.
        $this->deleteJson('/api/client/admin/eggs/' . $other->id)->assertStatus(400);
        $this->deleteJson('/api/client/admin/eggs/' . $id)->assertOk()->assertJsonPath('nest_id', $nest->id);
        $this->assertNull(Egg::query()->find($id));
    }

    public function testVariablesAreMadeChangedAndDeleted(): void
    {
        $egg = $this->egg($this->nest());
        $this->actingAs($this->rootAdmin());
        $input = ['name' => 'Server jar', 'description' => 'Which jar', 'env_variable' => 'SERVER_JARFILE', 'default_value' => 'server.jar', 'options' => ['user_viewable'], 'rules' => 'required|string|max:20'];

        $json = $this->postJson("/api/client/admin/eggs/{$egg->id}/variables", $input)->assertStatus(201)->json('variables');
        $this->assertCount(1, $json);
        $this->assertTrue($json[0]['user_viewable']);
        $this->assertFalse($json[0]['user_editable']);
        $variable = $json[0]['id'];

        unset($input['options']);
        $input['name'] = 'Jar';
        $changed = $this->patchJson("/api/client/admin/eggs/{$egg->id}/variables/$variable", $input)->assertOk()->json('variables.0');
        $this->assertSame('Jar', $changed['name']);
        $this->assertFalse($changed['user_viewable'], 'no options is neither');

        $this->postJson("/api/client/admin/eggs/{$egg->id}/variables", array_merge($input, ['env_variable' => 'STARTUP']))->assertStatus(422);
        $this->deleteJson("/api/client/admin/eggs/{$egg->id}/variables/$variable")->assertNoContent();
        $this->assertSame(0, EggVariable::query()->where('egg_id', $egg->id)->count());
    }

    public function testTheInstallScriptIsReadAndSaved(): void
    {
        $nest = $this->nest();
        $egg = $this->egg($nest);
        $source = $this->egg($nest, ['name' => 'apitest source', 'script_install' => '#!/bin/bash']);
        $this->actingAs($this->rootAdmin());

        $json = $this->getJson("/api/client/admin/eggs/{$egg->id}/script")->assertOk()->json();
        $this->assertSame([$source->id], array_column($json['copy_options'], 'id'));

        $this->patchJson("/api/client/admin/eggs/{$egg->id}/script", ['script_install' => 'echo hi', 'script_container' => 'alpine:3.4', 'script_entry' => 'ash', 'copy_script_from' => null])
            ->assertOk()->assertJsonPath('script_install', 'echo hi');
        $this->patchJson("/api/client/admin/eggs/{$egg->id}/script", ['script_install' => 'echo hi', 'script_container' => 'alpine:3.4', 'script_entry' => 'ash', 'copy_script_from' => $source->id])
            ->assertOk()->assertJsonPath('copying_from.id', $source->id);
        $this->getJson("/api/client/admin/eggs/{$source->id}/script")->assertJsonPath('relied_on_by.0.id', $egg->id);
    }

    public function testAnEggIsImportedAndUpdatedFromAFile(): void
    {
        $nest = $this->nest();
        $egg = $this->egg($nest);
        $this->actingAs($this->rootAdmin());
        $export = app(\Pterodactyl\Services\Eggs\Sharing\EggExporterService::class)->handle($egg->id);
        $file = fn () => UploadedFile::fake()->createWithContent('egg.json', $export);

        $imported = $this->post('/api/client/admin/eggs/import', ['import_file' => $file(), 'import_to_nest' => $nest->id], ['Accept' => 'application/json'])->assertStatus(201)->json('id');
        $this->assertNotSame($egg->id, $imported);
        $this->post('/api/client/admin/eggs/import', ['import_file' => $file()], ['Accept' => 'application/json'])->assertStatus(422);

        $this->post("/api/client/admin/eggs/{$egg->id}/import", ['import_file' => $file()], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('id', $egg->id);
    }

    public function testEachPermissionDoesItsOwnThing(): void
    {
        $nest = $this->nest();
        $egg = $this->egg($nest);
        $this->actingAs($this->userWith(['nests.view']));

        $this->getJson('/api/client/admin/nests')->assertOk();
        $this->getJson('/api/client/admin/nests/' . $nest->id)->assertOk();
        $this->getJson('/api/client/admin/eggs/' . $egg->id)->assertOk();
        $this->getJson("/api/client/admin/eggs/{$egg->id}/variables")->assertOk();
        $this->getJson("/api/client/admin/eggs/{$egg->id}/script")->assertOk();
        $this->postJson('/api/client/admin/nests', ['name' => 'apitest no'])->assertStatus(403);
        $this->patchJson('/api/client/admin/nests/' . $nest->id, ['name' => 'apitest no'])->assertStatus(403);
        $this->deleteJson('/api/client/admin/nests/' . $nest->id)->assertStatus(403);
        $this->postJson('/api/client/admin/eggs', $this->eggInput($nest))->assertStatus(403);
        $this->patchJson('/api/client/admin/eggs/' . $egg->id, $this->eggInput($nest))->assertStatus(403);
        $this->deleteJson('/api/client/admin/eggs/' . $egg->id)->assertStatus(403);
        $this->postJson("/api/client/admin/eggs/{$egg->id}/variables", [])->assertStatus(403);
        $this->patchJson("/api/client/admin/eggs/{$egg->id}/script", [])->assertStatus(403);
        $this->assertNotNull(Egg::query()->find($egg->id));
    }

    public function testTheExportStaysADownload(): void
    {
        $egg = $this->egg($this->nest());
        $this->actingAs($this->userWith(['eggs.export']));

        $this->get('/admin/nests/egg/' . $egg->id . '/export')->assertOk()->assertHeader('Content-Type', 'application/json');
    }
}

<?php

namespace Pterodactyl\Tests\Integration\Api\Client;

use Pterodactyl\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Services\CurseForge\CurseForgeService;

class CurseForgeControllerTest extends ClientApiIntegrationTestCase
{
    public function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        $this->service()->clearKey();
    }

    protected function tearDown(): void
    {
        $this->service()->clearKey();

        parent::tearDown();
    }

    private function service(): CurseForgeService
    {
        return $this->app->make(CurseForgeService::class);
    }

    private function withKey(): void
    {
        $this->service()->setKey('test-key');
    }

    public function testItIsOffUntilAnAdminAddsAKey(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/client/curseforge')->assertOk()->assertExactJson(['enabled' => false]);

        $this->withKey();
        $this->actingAs($user)->getJson('/api/client/curseforge')->assertOk()->assertExactJson(['enabled' => true]);
    }

    public function testItRequiresALogin(): void
    {
        $this->getJson('/api/client/curseforge/search')->assertUnauthorized();
    }

    public function testWithoutAKeyEveryQuestionIsAnErrorThePanelCanShow(): void
    {
        Http::fake();

        $response = $this->actingAs(User::factory()->create())->getJson('/api/client/curseforge/categories');

        $response->assertStatus(503);
        $response->assertJsonPath('errors.0.code', 'CurseForgeError');
        $response->assertJsonPath('errors.0.status', '503');
        $this->assertStringContainsString('API key', $response->json('errors.0.detail'));
        Http::assertNothingSent();
    }

    public function testSearchAsksCurseForgeForMinecraftWithTheKeyAndTheFilters(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => [['id' => 1]], 'pagination' => ['totalCount' => 1]])]);

        $response = $this->actingAs(User::factory()->create())->getJson(
            '/api/client/curseforge/search?classId=6&categoryIds=423,412&gameVersion=1.21.1&modLoaderType=4'
            . '&searchFilter=sodium&sortField=6&sortOrder=desc&index=40&pageSize=20'
        );

        $response->assertOk();
        $response->assertJsonPath('data.0.id', 1);
        Http::assertSent(function (Request $request) {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return str_starts_with($request->url(), 'https://api.curseforge.com/v1/mods/search?')
                && $request->hasHeader('x-api-key', 'test-key')
                && $query === [
                    'gameId' => '432',
                    'classId' => '6',
                    'gameVersion' => '1.21.1',
                    'modLoaderType' => '4',
                    'searchFilter' => 'sodium',
                    'sortField' => '6',
                    'sortOrder' => 'desc',
                    'index' => '40',
                    'pageSize' => '20',
                    // Several categories are a list that CurseForge reads as JSON.
                    'categoryIds' => '[423,412]',
                ];
        });
    }

    public function testOneCategoryIsAPlainParameter(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => []])]);

        $this->actingAs(User::factory()->create())->getJson('/api/client/curseforge/search?categoryIds=423')->assertOk();

        Http::assertSent(function (Request $request) {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return ($query['categoryId'] ?? null) === '423' && !isset($query['categoryIds']);
        });
    }

    public function testALoaderWithoutAVersionIsLeftOut(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => []])]);

        $this->actingAs(User::factory()->create())->getJson('/api/client/curseforge/search?modLoaderType=4')->assertOk();

        Http::assertSent(fn (Request $request) => !str_contains($request->url(), 'modLoaderType'));
    }

    /** @return array<string, array{string}> */
    public static function badSearches(): array
    {
        return [
            'a page that is too big' => ['pageSize=999'],
            'a page of nothing' => ['pageSize=0'],
            'categories that are not numbers' => ['categoryIds=abc'],
            'too many categories' => ['categoryIds=1,2,3,4,5,6,7,8,9,10,11'],
            'a version that tries to add a parameter' => ['gameVersion=1.21.1%26gameId%3D1'],
            'a loader that does not exist' => ['modLoaderType=9'],
            'a sort that does not exist' => ['sortField=99'],
            'an order that does not exist' => ['sortOrder=sideways'],
            'a search that is far too long' => ['searchFilter=' . '..............................................................................................................'],
            'an index too deep' => ['index=20000'],
        ];
    }

    /** @dataProvider badSearches */
    public function testBadSearchesAreRefusedBeforeCurseForgeIsAsked(string $query): void
    {
        $this->withKey();
        Http::fake();

        $this->actingAs(User::factory()->create())->getJson('/api/client/curseforge/search?' . $query)->assertUnprocessable();

        Http::assertNothingSent();
    }

    public function testTheSameQuestionIsOnlyAskedOnce(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => ['id' => 7]])]);
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/client/curseforge/mods/7')->assertOk();
        $this->actingAs($user)->getJson('/api/client/curseforge/mods/7')->assertOk();

        Http::assertSentCount(1);
    }

    public function testAProjectItsDescriptionItsFilesAndTheirChangelogs(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => 'x'])]);
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/client/curseforge/mods/7/description')->assertOk();
        $this->actingAs($user)->getJson('/api/client/curseforge/mods/7/files?gameVersion=1.21.1&index=50&pageSize=50')->assertOk();
        $this->actingAs($user)->getJson('/api/client/curseforge/mods/7/files/99/changelog')->assertOk();

        $urls = [];
        Http::assertSent(function (Request $request) use (&$urls) {
            $urls[] = $request->url();

            return true;
        });
        $this->assertContains('https://api.curseforge.com/v1/mods/7/description', $urls);
        $this->assertContains('https://api.curseforge.com/v1/mods/7/files?gameVersion=1.21.1&index=50&pageSize=50', $urls);
        $this->assertContains('https://api.curseforge.com/v1/mods/7/files/99/changelog', $urls);
    }

    public function testIdsInThePathHaveToBeNumbers(): void
    {
        $this->withKey();
        Http::fake();

        $this->actingAs(User::factory()->create())->getJson('/api/client/curseforge/mods/abc')->assertNotFound();
        $this->actingAs(User::factory()->create())->getJson('/api/client/curseforge/mods/1%2F..%2Fgames')->assertNotFound();

        Http::assertNothingSent();
    }

    public function testSeveralModsAndFilesAreReadInOneQuestion(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => []])]);
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/client/curseforge/mods', ['ids' => [1, 2, 3]])->assertOk();
        $this->actingAs($user)->postJson('/api/client/curseforge/files', ['ids' => [10, 20]])->assertOk();

        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.curseforge.com/v1/mods'
            && $request->data() === ['modIds' => [1, 2, 3], 'filterPcOnly' => false]);
        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.curseforge.com/v1/mods/files'
            && $request->data() === ['fileIds' => [10, 20]]);
    }

    public function testBulkQuestionsAreLimitedAndChecked(): void
    {
        $this->withKey();
        Http::fake();
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/client/curseforge/mods', ['ids' => []])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/client/curseforge/mods', ['ids' => range(1, 51)])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/client/curseforge/mods', ['ids' => ['x']])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/client/curseforge/files', ['ids' => [0]])->assertUnprocessable();

        Http::assertNothingSent();
    }

    public function testFingerprintsAreLookedUpForMinecraft(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => ['exactMatches' => []]])]);
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/client/curseforge/fingerprints', ['fingerprints' => [123456, 4294967295]])->assertOk();

        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.curseforge.com/v1/fingerprints/432'
            && $request->data() === ['fingerprints' => [123456, 4294967295]]);

        $this->actingAs($user)->postJson('/api/client/curseforge/fingerprints', ['fingerprints' => [4294967296]])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/client/curseforge/fingerprints', ['fingerprints' => [-1]])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/client/curseforge/fingerprints', ['fingerprints' => range(1, 201)])->assertUnprocessable();
    }

    public function testTheListsOfCategoriesAndVersionsAreAskedForMinecraft(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => []])]);
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/client/curseforge/categories')->assertOk();
        $this->actingAs($user)->getJson('/api/client/curseforge/versions')->assertOk();

        Http::assertSent(fn (Request $request) => $request->url() === 'https://api.curseforge.com/v1/categories?gameId=432');
        Http::assertSent(fn (Request $request) => str_starts_with($request->url(), 'https://api.curseforge.com/v1/minecraft/version'));
    }

    public function testAKeyThatIsRefusedBecomesAMessageForTheAdmin(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response([], 403)]);

        $response = $this->actingAs(User::factory()->create())->getJson('/api/client/curseforge/mods/7');

        $response->assertStatus(502);
        $this->assertStringContainsString('did not accept the API key', $response->json('errors.0.detail'));
    }

    public function testTheKeyIsNeverInAnAnswer(): void
    {
        $this->withKey();
        Http::fake(['api.curseforge.com/*' => Http::response(['data' => ['id' => 7]])]);

        $response = $this->actingAs(User::factory()->create())->getJson('/api/client/curseforge/mods/7');

        $this->assertStringNotContainsString('test-key', $response->getContent());
        $this->assertStringNotContainsString('test-key', json_encode($response->headers->all()));
    }
}

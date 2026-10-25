<?php

namespace Pterodactyl\Tests\Integration\Api\Client\Server;

use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

class AutomodpackTest extends ClientApiIntegrationTestCase
{
    private const PRINT = 'b35f8f1ba870aaa58c48d0974877c4438934029a0c7b6e7d9483e0f5c729f834';

    /** @return array{\Pterodactyl\Models\User, \Pterodactyl\Models\Server} */
    private function account(array $permissions = []): array
    {
        $user = \Pterodactyl\Models\User::factory()->create();
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();
        $server = $this->createServerModel(['user_id' => empty($permissions) ? $user->id : \Pterodactyl\Models\User::factory()->create()->id, 'egg_id' => $egg->id]);
        if (!empty($permissions)) {
            \Pterodactyl\Models\Subuser::query()->create(['user_id' => $user->id, 'server_id' => $server->id, 'permissions' => $permissions]);
        }

        return [$user, $server];
    }

    private const LINE = '[16:34:18 INFO] [AutoModpack]: AutoModpack host certificate fingerprint: ';

    /**
     * @param  array<string, string|\Throwable>  $files  path => content
     * @param  list<array{string, string}>  $written
     */
    private function wings(array $files, array &$written = []): void
    {
        $mock = \Mockery::mock(DaemonFileRepository::class);
        $mock->shouldReceive('setServer')->andReturnSelf();
        $mock->shouldReceive('getContent')->andReturnUsing(function (string $path) use ($files) {
            $content = $files[$path] ?? new \RuntimeException('missing');
            if ($content instanceof \Throwable) {
                throw $content;
            }

            return $content;
        });
        $mock->shouldReceive('putContent')->andReturnUsing(function (string $path, string $content) use (&$written) {
            $written[] = [$path, $content];

            return new \GuzzleHttp\Psr7\Response();
        });
        $this->app->instance(DaemonFileRepository::class, $mock);
    }

    public function testTheFingerprintIsFoundInTheLogAndKept(): void
    {
        [$user, $server] = $this->account();
        $written = [];
        $this->wings(['/logs/latest.log' => "[16:00:00 INFO] starting\n" . self::LINE . "AAAA\n" . self::LINE . self::PRINT . "\n[16:34:19 INFO] done\n", '/stratosphere.json' => json_encode(['software' => 'fabric'])], $written);

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/automodpack")
            ->assertOk()->assertJsonPath('fingerprint', self::PRINT);

        $this->assertCount(1, $written);
        $this->assertSame('/stratosphere.json', $written[0][0]);
        $document = json_decode($written[0][1], true);
        $this->assertSame(self::PRINT, $document['automodpack']['fingerprint']);
        $this->assertSame('fabric', $document['software'], 'what was in the file stays');
    }

    public function testAKeptFingerprintIsNotLookedForAgain(): void
    {
        [$user, $server] = $this->account();
        $written = [];
        $this->wings(['/stratosphere.json' => json_encode(['automodpack' => ['fingerprint' => self::PRINT]])], $written);

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/automodpack")->assertOk()->assertJsonPath('fingerprint', self::PRINT);
        $this->assertSame([], $written);
    }

    public function testAScanFindsANewOneWhenTheCertificateWasMadeAgain(): void
    {
        [$user, $server] = $this->account();
        $new = str_repeat('c', 64);
        $written = [];
        $this->wings(['/stratosphere.json' => json_encode(['automodpack' => ['fingerprint' => self::PRINT]]), '/logs/latest.log' => self::LINE . $new . "\n"], $written);

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/automodpack?scan=1")->assertOk()->assertJsonPath('fingerprint', $new);
        $this->assertSame($new, json_decode($written[0][1], true)['automodpack']['fingerprint']);
    }

    public function testNothingIsMadeUpWhenThereIsNoneOrTheLineIsWrong(): void
    {
        [$user, $server] = $this->account();
        $written = [];
        $this->wings(['/logs/latest.log' => self::LINE . "not-a-fingerprint\n" . self::LINE . str_repeat('z', 64) . "\n"], $written);

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/automodpack")->assertOk()->assertJsonPath('fingerprint', null);
        $this->assertSame([], $written);
    }

    public function testAFilesFailureStillAnswers(): void
    {
        [$user, $server] = $this->account();
        $this->wings([]);

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/automodpack")->assertOk()->assertJsonPath('fingerprint', null);
    }

    public function testEverybodyWhoSeesTheServerMayAskForIt(): void
    {
        [$user, $server] = $this->account(['control.console']);
        $this->wings(['/stratosphere.json' => json_encode(['automodpack' => ['fingerprint' => self::PRINT]])]);

        $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}/automodpack")->assertOk()->assertJsonPath('fingerprint', self::PRINT);
        $this->actingAs(\Pterodactyl\Models\User::factory()->create())->getJson("/api/client/servers/{$server->uuid}/automodpack")->assertStatus(404);
    }
}

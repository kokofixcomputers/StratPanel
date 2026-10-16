<?php

namespace Pterodactyl\Tests\Unit\Services\CurseForge;

use Mockery;
use Mockery\MockInterface;
use Pterodactyl\Tests\TestCase;
use Illuminate\Cache\Repository;
use Illuminate\Cache\ArrayStore;
use Illuminate\Encryption\Encrypter;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Pterodactyl\Services\CurseForge\CurseForgeService;
use Pterodactyl\Services\CurseForge\CurseForgeException;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

class CurseForgeServiceTest extends TestCase
{
    /** @var array<string, string> */
    private array $stored = [];

    private MockInterface $settings;

    private Factory $http;

    private Encrypter $encrypter;

    public function setUp(): void
    {
        parent::setUp();

        $this->stored = [];
        $this->settings = Mockery::mock(SettingsRepositoryInterface::class);
        $this->settings->shouldReceive('get')->andReturnUsing(fn ($key, $default) => $this->stored[$key] ?? $default);
        $this->settings->shouldReceive('set')->andReturnUsing(function ($key, $value) {
            $this->stored[$key] = $value;
        });
        $this->settings->shouldReceive('forget')->andReturnUsing(function ($key) {
            unset($this->stored[$key]);
        });
        $this->http = new Factory();
        $this->encrypter = new Encrypter(str_repeat('k', 32), 'AES-256-CBC');
    }

    public function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function service(): CurseForgeService
    {
        return new CurseForgeService($this->settings, $this->http, new Repository(new ArrayStore()), $this->encrypter);
    }

    public function testThereIsNoKeyUntilOneIsSaved(): void
    {
        $service = $this->service();
        $this->assertFalse($service->enabled());
        $this->assertNull($service->apiKey());

        $service->setKey('  $2a$10$abc.def/ghi  ');
        $this->assertTrue($service->enabled());
        $this->assertSame('$2a$10$abc.def/ghi', $service->apiKey());
        $this->assertFalse($service->fromEnvironment());
    }

    public function testTheKeyIsStoredEncrypted(): void
    {
        $this->service()->setKey('secret-key-value');

        $this->assertNotEmpty($this->stored[CurseForgeService::KEY]);
        $this->assertStringNotContainsString('secret-key-value', $this->stored[CurseForgeService::KEY]);
    }

    public function testAKeyThatCannotBeDecryptedCountsAsNoKey(): void
    {
        $this->stored[CurseForgeService::KEY] = 'not encrypted at all';

        $this->assertFalse($this->service()->enabled());
    }

    public function testTheKeyCanBeRemoved(): void
    {
        $service = $this->service();
        $service->setKey('abc');
        $service->clearKey();

        $this->assertFalse($service->enabled());
    }

    public function testAskingWithoutAKeyFailsClearly(): void
    {
        try {
            $this->service()->get('/v1/mods/1');
            $this->fail('Expected an exception');
        } catch (CurseForgeException $exception) {
            $this->assertSame(503, $exception->status());
            $this->assertStringContainsString('API key', $exception->getMessage());
        }
    }

    public function testTheKeyIsSentAsAHeaderAndTheAnswerIsReturned(): void
    {
        $this->http->fake(['api.curseforge.com/*' => $this->http::response(['data' => ['id' => 7, 'name' => 'Sodium']])]);
        $service = $this->service();
        $service->setKey('the-key');

        $this->assertSame(['data' => ['id' => 7, 'name' => 'Sodium']], $service->get('/v1/mods/7', ['gameId' => 432]));

        $this->http->assertSent(function (Request $request) {
            return $request->url() === 'https://api.curseforge.com/v1/mods/7?gameId=432'
                && $request->hasHeader('x-api-key', 'the-key');
        });
    }

    public function testPostSendsTheBodyAsJson(): void
    {
        $this->http->fake(['api.curseforge.com/*' => $this->http::response(['data' => []])]);
        $service = $this->service();
        $service->setKey('the-key');
        $service->post('/v1/mods', ['modIds' => [1, 2], 'filterPcOnly' => false]);

        $this->http->assertSent(fn (Request $request) => $request->method() === 'POST'
            && $request->data() === ['modIds' => [1, 2], 'filterPcOnly' => false]);
    }

    public function testTheSameQuestionIsAnsweredFromTheCache(): void
    {
        $this->http->fake(['api.curseforge.com/*' => $this->http::response(['data' => ['n' => 1]])]);
        $service = $this->service();
        $service->setKey('the-key');

        $service->get('/v1/mods/7', [], 60);
        $service->get('/v1/mods/7', [], 60);
        $service->get('/v1/mods/8', [], 60);

        $this->http->assertSentCount(2);
    }

    public function testNothingIsCachedWithATtlOfZero(): void
    {
        $this->http->fake(['api.curseforge.com/*' => $this->http::response(['data' => []])]);
        $service = $this->service();
        $service->setKey('the-key');

        $service->get('/v1/games/432', [], 0);
        $service->get('/v1/games/432', [], 0);

        $this->http->assertSentCount(2);
    }

    /** @return array<string, array{int, int, string}> */
    public static function errors(): array
    {
        return [
            'a key that is not accepted' => [403, 502, 'did not accept the API key'],
            'a key that is unknown' => [401, 502, 'did not accept the API key'],
            'something that is not there' => [404, 404, 'not found'],
            'too many questions' => [429, 429, 'busy'],
            'a failure at CurseForge' => [500, 502, 'error (500)'],
        ];
    }

    /** @dataProvider errors */
    public function testFailuresBecomeMessagesForPeople(int $upstream, int $status, string $text): void
    {
        $this->http->fake(['api.curseforge.com/*' => $this->http::response(['message' => 'x'], $upstream)]);
        $service = $this->service();
        $service->setKey('the-key');

        try {
            $service->get('/v1/mods/7');
            $this->fail('Expected an exception');
        } catch (CurseForgeException $exception) {
            $this->assertSame($status, $exception->status());
            $this->assertStringContainsString($text, $exception->getMessage());
        }
    }

    public function testAFailedAnswerIsNotCached(): void
    {
        $this->http->fake(['api.curseforge.com/*' => $this->http->sequence()
            ->push([], 500)
            ->push(['data' => ['ok' => true]])]);
        $service = $this->service();
        $service->setKey('the-key');

        try {
            $service->get('/v1/mods/7', [], 60);
        } catch (CurseForgeException) {
        }

        $this->assertSame(['data' => ['ok' => true]], $service->get('/v1/mods/7', [], 60));
    }

    public function testATooBusyAnswerIsTriedOnceMore(): void
    {
        $this->http->fake(['api.curseforge.com/*' => $this->http->sequence()
            ->push([], 429)
            ->push(['data' => ['id' => 1]])]);
        $service = $this->service();
        $service->setKey('the-key');

        $this->assertSame(['data' => ['id' => 1]], $service->get('/v1/mods/1'));
    }

    public function testAnAnswerThatIsNotJsonIsAnError(): void
    {
        $this->http->fake(['api.curseforge.com/*' => $this->http::response('<html>nope</html>', 200)]);
        $service = $this->service();
        $service->setKey('the-key');

        $this->expectException(CurseForgeException::class);
        $service->get('/v1/mods/1');
    }

    public function testVerifyTellsWhetherTheKeyWorks(): void
    {
        $this->http->fake(['api.curseforge.com/v1/games/432' => $this->http::response(['data' => ['name' => 'Minecraft']])]);
        $service = $this->service();
        $service->setKey('the-key');
        $this->assertSame(['ok' => true, 'message' => 'CurseForge accepted the key (Minecraft).'], $service->verify());

        // A key that is refused, with a new client because the first answer would be used again.
        $this->http = new Factory();
        $this->http->fake(['api.curseforge.com/*' => $this->http::response([], 403)]);
        $result = $this->service()->verify();
        $this->assertFalse($result['ok']);
        $this->assertStringContainsString('did not accept the API key', $result['message']);
    }
}

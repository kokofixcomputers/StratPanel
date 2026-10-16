<?php

namespace Pterodactyl\Tests\Integration\Files;

use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use GuzzleHttp\Promise\Create;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Cache;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Exception\ConnectException;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Subuser;
use Pterodactyl\Models\Permission;
use Pterodactyl\Services\Files\PullBatchService;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Pterodactyl\Tests\Traits\Integration\CreatesTestModels;

class PullBatchTest extends IntegrationTestCase
{
    use CreatesTestModels;

    private FakePullNode $node;

    private PullBatchService $batch;

    public function setUp(): void
    {
        parent::setUp();

        $this->clean();
        $this->node = new FakePullNode();
        $this->app->instance(DaemonFileRepository::class, $this->node);
        $this->batch = new PullBatchService($this->node);
        $this->batch->retryWait = 0;
        $this->batch->busyWait = 0;
        $this->app->instance(PullBatchService::class, $this->batch);
    }

    public function tearDown(): void
    {
        $this->clean();

        parent::tearDown();
    }

    private function clean(): void
    {
        $ids = User::query()->where('email', 'like', '%@pull-test.example')->pluck('id');
        \DB::table('servers')->whereIn('owner_id', $ids)->delete();
        User::query()->whereIn('id', $ids)->delete();
    }

    private function user(): User
    {
        $name = 'user' . bin2hex(random_bytes(4));

        return User::factory()->create(['username' => $name, 'email' => $name . '@pull-test.example', 'password' => Hash::make('correct-horse-battery')]);
    }

    private function server(?User $owner = null): Server
    {
        $egg = \Pterodactyl\Models\Egg::query()->firstOrFail();

        return $this->createServerModel(['user_id' => ($owner ?? $this->user())->id, 'egg_id' => $egg->id, 'nest_id' => $egg->nest_id]);
    }

    /** @return list<array{url: string, directory: string, filename: string}> */
    private function files(int $count): array
    {
        return array_map(fn ($i) => ['url' => "https://cdn.example/mod-$i.jar", 'directory' => '/mods', 'filename' => "mod-$i.jar"], range(1, $count));
    }

    /** @return list<array<string, mixed>> the lines that were sent */
    private function download(array $files, ?callable $aborted = null): array
    {
        $lines = [];
        $this->batch->run($this->server(), $files, function (array $line) use (&$lines) {
            $lines[] = $line;
        }, $aborted);

        return $lines;
    }

    private function http(string $status, string $message): RequestException
    {
        return new RequestException($message, new Request('POST', '/'), new Response((int) $status, [], json_encode(['error' => $message, 'message' => $message])));
    }

    // ---- the work -------------------------------------------------------------------------------------------------------

    public function testEveryFileIsDownloadedAndEveryOneIsReported(): void
    {
        $lines = $this->download($this->files(5));

        $this->assertSame(['total' => 5], $lines[0]);
        $this->assertSame([1, 2, 3, 4, 5], array_column(array_slice($lines, 1, 5), 'done'));
        $this->assertSame([true, true, true, true, true], array_column(array_slice($lines, 1, 5), 'ok'));
        $this->assertSame(['finished' => true, 'done' => 5, 'failed' => 0], $lines[6]);
        $this->assertCount(5, $this->node->calls);
        $this->assertSame(['https://cdn.example/mod-1.jar', '/mods', 'mod-1.jar'], $this->node->calls[0]);
    }

    public function testAFileThatKeepsFailingIsReportedWithTheReasonAndTheRestGoOn(): void
    {
        $this->node->outcomes['https://cdn.example/mod-2.jar'] = array_fill(0, 10, $this->http('400', 'An error was encountered while trying to download this file.'));

        $lines = $this->download($this->files(4));

        $failed = array_values(array_filter($lines, fn ($l) => ($l['ok'] ?? null) === false));
        $this->assertCount(1, $failed);
        $this->assertSame(1, $failed[0]['index']);
        $this->assertSame('An error was encountered while trying to download this file.', $failed[0]['error']);
        $this->assertSame(['finished' => true, 'done' => 4, 'failed' => 1], end($lines));
        $this->assertSame(3, count(array_filter($this->node->calls, fn ($c) => $c[0] === 'https://cdn.example/mod-2.jar')), 'three attempts');
    }

    public function testATransientFailureIsTriedAgain(): void
    {
        $this->node->outcomes['https://cdn.example/mod-1.jar'] = [new ConnectException('reset', new Request('POST', '/'))];

        $lines = $this->download($this->files(1));

        $this->assertSame(['finished' => true, 'done' => 1, 'failed' => 0], end($lines));
        $this->assertCount(2, $this->node->calls);
    }

    public function testABusyNodeIsWaitedForWithoutUsingUpTheAttempts(): void
    {
        $busy = $this->http('400', 'This server has reached its limit of 3 simultaneous remote file downloads at once.');
        $this->node->outcomes['https://cdn.example/mod-1.jar'] = [$busy, $busy, $busy, $busy, $busy];

        $lines = $this->download($this->files(1));

        $this->assertSame(['finished' => true, 'done' => 1, 'failed' => 0], end($lines));
        $this->assertCount(6, $this->node->calls);
    }

    public function testNeverMoreThanThreeAtOnce(): void
    {
        $this->download($this->files(20));

        $this->assertLessThanOrEqual(3, $this->node->maxActive);
        $this->assertGreaterThan(1, $this->node->maxActive, 'they do run side by side');
    }

    public function testNothingNewIsStartedWhenNobodyListens(): void
    {
        $asked = 0;
        $lines = $this->download($this->files(10), function () use (&$asked) {
            return ++$asked > 4;
        });

        $this->assertLessThan(10, count($this->node->calls));
        $this->assertSame(true, end($lines)['finished']);
    }

    // ---- the request ----------------------------------------------------------------------------------------------------

    public function testTheOwnerGetsAStreamOfLines(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);

        $response = $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/pull-batch", ['files' => $this->files(3)]);

        $response->assertOk();
        $this->assertStringContainsString('application/x-ndjson', (string) $response->headers->get('Content-Type'));
        $this->assertSame('no', $response->headers->get('X-Accel-Buffering'));
        $lines = array_map(fn ($l) => json_decode($l, true), array_filter(explode("\n", $response->streamedContent())));
        $this->assertSame(['total' => 3], $lines[0]);
        $this->assertSame(['finished' => true, 'done' => 3, 'failed' => 0], end($lines));
    }

    public function testPeopleWhoMayNotCreateFilesCanNotStartDownloads(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $reader = $this->user();
        Subuser::query()->create(['user_id' => $reader->id, 'server_id' => $server->id, 'permissions' => [Permission::ACTION_FILE_READ]]);

        $this->actingAs($reader)->postJson("/api/client/servers/{$server->uuid}/files/pull-batch", ['files' => $this->files(1)])->assertStatus(403);
        $this->assertSame([], $this->node->calls);
    }

    public function testOnlyOneListRunsPerServer(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $lock = Cache::lock('files:pull-batch:' . $server->id, 60);
        $this->assertTrue($lock->get());

        $this->actingAs($owner)->postJson("/api/client/servers/{$server->uuid}/files/pull-batch", ['files' => $this->files(1)])->assertStatus(409);
        $this->assertSame([], $this->node->calls);

        $lock->release();
        $this->postJson("/api/client/servers/{$server->uuid}/files/pull-batch", ['files' => $this->files(1)])->assertOk()->streamedContent();
        $this->postJson("/api/client/servers/{$server->uuid}/files/pull-batch", ['files' => $this->files(1)])->assertOk()->streamedContent();
    }

    public function testTheListIsChecked(): void
    {
        $owner = $this->user();
        $server = $this->server($owner);
        $url = "/api/client/servers/{$server->uuid}/files/pull-batch";

        $this->actingAs($owner)->postJson($url, ['files' => []])->assertStatus(422);
        $this->postJson($url, ['files' => [['url' => 'not a url']]])->assertStatus(422);
        $this->postJson($url, ['files' => $this->files(501)])->assertStatus(422);
        $this->postJson($url, [])->assertStatus(422);
        $this->assertSame([], $this->node->calls);
    }
}

/** A node that downloads what it is told to, with failures the tests plan. */
class FakePullNode extends DaemonFileRepository
{
    /** @var list<array{string, string|null, string|null}> */
    public array $calls = [];

    /** @var array<string, list<\Throwable>> url => what happens on the first calls (then it works) */
    public array $outcomes = [];

    public int $maxActive = 0;

    private int $active = 0;

    public function __construct()
    {
    }

    public function setServer($server): static
    {
        return $this;
    }

    public function pullAsync(string $url, ?string $directory, ?string $filename = null): \GuzzleHttp\Promise\PromiseInterface
    {
        $this->calls[] = [$url, $directory, $filename];
        $this->maxActive = max($this->maxActive, ++$this->active);

        $planned = $this->outcomes[$url] ?? [];
        $error = array_shift($planned);
        $this->outcomes[$url] = $planned;
        $promise = $error !== null ? Create::rejectionFor($error) : Create::promiseFor(new Response(200));

        // Done when the promise is settled, which happens in the queue after the next files were started.
        return $promise->then(
            function ($value) {
                --$this->active;

                return $value;
            },
            function ($reason) {
                --$this->active;

                return Create::rejectionFor($reason);
            }
        );
    }
}

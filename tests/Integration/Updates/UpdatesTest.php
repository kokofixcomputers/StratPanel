<?php

namespace Pterodactyl\Tests\Integration\Updates;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Exception\TransferException;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Role;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Location;
use Pterodactyl\Services\Nodes\NodeUpdateService;
use Pterodactyl\Services\Updates\ToolUpdateService;
use Pterodactyl\Repositories\Wings\DaemonSelfUpdateRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Tests\Integration\IntegrationTestCase;
use Illuminate\Support\Facades\Hash;

class UpdatesTest extends IntegrationTestCase
{
    private FakeSelfUpdate $wings;

    private string $dir;

    public function setUp(): void
    {
        parent::setUp();

        // The admin layout prints how long the request took.
        if (!defined('LARAVEL_START')) {
            define('LARAVEL_START', microtime(true));
        }

        $this->wings = new FakeSelfUpdate();
        $this->app->instance(DaemonSelfUpdateRepository::class, $this->wings);
        Cache::forget('wings:latest');
        $this->dir = sys_get_temp_dir() . '/updates-test-' . bin2hex(random_bytes(4));
        File::makeDirectory($this->dir);
        config(['updates.request_file' => $this->dir . '/request', 'updates.status_file' => $this->dir . '/status.json']);
        Node::query()->where('fqdn', 'like', '%.upd-test.example')->delete();
        User::query()->where('email', 'like', '%@upd-test.example')->delete();
        \DB::table('roles')->where('name', 'like', 'upd-%')->delete();
    }

    public function tearDown(): void
    {
        File::deleteDirectory($this->dir);
        Cache::forget('wings:latest');
        Node::query()->where('fqdn', 'like', '%.upd-test.example')->delete();
        User::query()->where('email', 'like', '%@upd-test.example')->delete();
        \DB::table('roles')->where('name', 'like', 'upd-%')->delete();

        parent::tearDown();
    }

    private function user(array $permissions = [], bool $root = false): User
    {
        $name = 'user' . bin2hex(random_bytes(4));
        $user = User::factory()->create(['username' => $name, 'email' => $name . '@upd-test.example', 'password' => Hash::make('x-long-password'), 'root_admin' => $root]);
        if ($permissions) {
            $user->roles()->attach(Role::query()->create(['name' => 'upd-' . bin2hex(random_bytes(3)), 'permissions' => $permissions, 'color' => '#000000'])->id);
        }

        return $user->fresh();
    }

    /** Switches the user, also after a request already ran in this test. */
    private function as(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($user);
    }

    private function node(string $name): Node
    {
        return Node::factory()->create([
            'name' => $name,
            'fqdn' => strtolower($name) . '.upd-test.example',
            'location_id' => Location::query()->first()?->id ?? Location::factory()->create()->id,
        ]);
    }

    private function nodes(): NodeUpdateService
    {
        return $this->app->make(NodeUpdateService::class);
    }

    // ---- the newest version --------------------------------------------------------------------------------------------

    public function testTheNewestVersionComesFromTheRelease(): void
    {
        Http::fake(['*version.txt' => Http::response("nightly-20261016-abc1234\n")]);

        $this->assertSame('nightly-20261016-abc1234', $this->nodes()->latest());
        $this->assertTrue($this->nodes()->outdated('nightly-20261001-old'));
        $this->assertTrue($this->nodes()->outdated('v1.12.3'));
        $this->assertFalse($this->nodes()->outdated('nightly-20261016-abc1234'));
        $this->assertFalse($this->nodes()->outdated('vnightly-20261016-abc1234'));
        $this->assertFalse($this->nodes()->outdated(''), 'a node that did not say its version is not called old');
    }

    public function testAMissingReleaseIsNotRemembered(): void
    {
        Http::fake(['*version.txt' => Http::sequence()->push('', 404)->push('', 404)->push('nightly-2')]);
        $this->assertNull($this->nodes()->latest());
        $this->assertFalse($this->nodes()->outdated('v1'));

        Cache::forget('wings:latest');
        $this->assertSame('nightly-2', $this->nodes()->latest());
    }

    // ---- updating nodes ------------------------------------------------------------------------------------------------

    public function testOneNodeIsUpdated(): void
    {
        $node = $this->node('A');
        $this->wings->answers[$node->id] = ['from' => 'nightly-1', 'to' => 'nightly-2', 'updated' => true];

        $result = $this->nodes()->update($node);

        $this->assertSame('updated', $result['status']);
        $this->assertSame('nightly-2', $result['to']);
    }

    public function testANodeThatIsCurrentSaysSo(): void
    {
        $node = $this->node('B');
        $this->wings->answers[$node->id] = ['from' => 'nightly-2', 'to' => 'nightly-2', 'updated' => false];

        $this->assertSame('current', $this->nodes()->update($node)['status']);
    }

    public function testFailuresAreReportedPerNodeAndTheRestGoesOn(): void
    {
        $down = $this->node('Down');
        $old = $this->node('Old');
        $bad = $this->node('Bad');
        $fine = $this->node('Fine');
        $this->wings->answers[$down->id] = 'unreachable';
        $this->wings->answers[$old->id] = ['from' => '', 'to' => '', 'updated' => false, 'unsupported' => true];
        $this->wings->answers[$bad->id] = ['from' => '', 'to' => '', 'updated' => false, 'error' => 'the download does not match its checksum'];
        $this->wings->answers[$fine->id] = ['from' => 'a', 'to' => 'b', 'updated' => true];

        $results = collect($this->nodes()->updateAll(Node::query()->whereIn('id', [$down->id, $old->id, $bad->id, $fine->id])->orderBy('id')->get()))->keyBy('node');

        $this->assertSame('failed', $results[$down->id]['status']);
        $this->assertStringContainsString('could not be reached', $results[$down->id]['message']);
        $this->assertSame('failed', $results[$old->id]['status']);
        $this->assertStringContainsString('by hand', $results[$old->id]['message']);
        $this->assertSame('failed', $results[$bad->id]['status']);
        $this->assertStringContainsString('checksum', $results[$bad->id]['message']);
        $this->assertSame('updated', $results[$fine->id]['status']);
    }

    // ---- who may -------------------------------------------------------------------------------------------------------

    public function testNodeSettingsAreNotEnoughToUpdateNodes(): void
    {
        $node = $this->node('Who');

        $this->as($this->user(['nodes.view', 'nodes.update']))->post('/admin/nodes/view/' . $node->id . '/update')->assertStatus(403);
        $this->post('/admin/nodes/update')->assertStatus(403);
        $this->assertSame([], $this->wings->updated);
    }

    public function testTheRightToUpdateNodesUpdatesThem(): void
    {
        $node = $this->node('Who');
        $this->wings->answers[$node->id] = ['from' => 'a', 'to' => 'b', 'updated' => true];

        $this->as($this->user(['nodes.view', 'nodes.software']))->post('/admin/nodes/view/' . $node->id . '/update')->assertOk()->assertJson(['status' => 'updated']);
        $this->assertSame([$node->id], $this->wings->updated);
    }

    public function testAFailedUpdateIsABadGatewayForTheButton(): void
    {
        $node = $this->node('Fail');
        $this->wings->answers[$node->id] = 'unreachable';

        $this->as($this->user([], true))->post('/admin/nodes/view/' . $node->id . '/update')->assertStatus(502)->assertJson(['status' => 'failed']);
    }

    public function testUpdateAllReturnsEveryNode(): void
    {
        $a = $this->node('One');
        $b = $this->node('Two');
        $this->wings->answers[$a->id] = ['from' => 'a', 'to' => 'b', 'updated' => true];
        $this->wings->answers[$b->id] = 'unreachable';

        $ids = collect($this->as($this->user(['nodes.software']))->post('/admin/nodes/update')->assertOk()->json('results'))->pluck('node');

        $this->assertTrue($ids->contains($a->id) && $ids->contains($b->id));
    }

    // ---- router and edge ------------------------------------------------------------------------------------------------

    public function testTheUpdatesPageIsNotForRolesEvenWithTheNodeRight(): void
    {
        $this->as($this->user(['nodes.view', 'nodes.software', 'settings.general.view']))->get('/admin/updates')->assertStatus(403);
        $this->post('/admin/updates', ['action' => 'local'])->assertStatus(403);
    }

    public function testRootAdminsSeeTheUpdatesPage(): void
    {
        $this->as($this->user([], true))->get('/admin/updates')->assertOk()->assertSee('Update the panel');
    }

    public function testNothingIsAskedWithoutTheUpdaterInstalled(): void
    {
        $this->as($this->user([], true))->post('/admin/updates', ['action' => 'local'])->assertStatus(409);
        $this->assertFileDoesNotExist($this->dir . '/request');
    }

    public function testARequestIsOneOfTwoWords(): void
    {
        touch($this->dir . '/installed');
        $this->as($this->user([], true));

        $this->post('/admin/updates', ['action' => 'download'])->assertStatus(202);
        $this->assertSame('download', file_get_contents($this->dir . '/request'));

        // Waiting requests are not stacked.
        $this->post('/admin/updates', ['action' => 'local'])->assertStatus(409);
        $this->assertSame('download', file_get_contents($this->dir . '/request'));

        unlink($this->dir . '/request');
        // Anything unknown means the harmless one, never something the updater would take as a command.
        $this->post('/admin/updates', ['action' => 'rm -rf /; local'])->assertStatus(202);
        $this->assertSame('local', file_get_contents($this->dir . '/request'));
    }

    public function testTheNightlyChannelIsItsOwnWord(): void
    {
        touch($this->dir . '/installed');
        $this->as($this->user([], true))->post('/admin/updates', ['action' => 'download', 'channel' => 'nightly'])->assertStatus(202);
        $this->assertSame('download-nightly', file_get_contents($this->dir . '/request'));

        unlink($this->dir . '/request');
        $this->post('/admin/updates', ['action' => 'download', 'channel' => 'whatever'])->assertStatus(202);
        $this->assertSame('download', file_get_contents($this->dir . '/request'));

        unlink($this->dir . '/request');
        // The channel means nothing for the files on this machine.
        $this->post('/admin/updates', ['action' => 'local', 'channel' => 'nightly'])->assertStatus(202);
        $this->assertSame('local', file_get_contents($this->dir . '/request'));
    }

    public function testTheWholePanelIsAskedForWithItsOwnWords(): void
    {
        touch($this->dir . '/installed');
        $this->as($this->user([], true))->post('/admin/updates', ['action' => 'panel'])->assertStatus(202);
        $this->assertSame('panel', file_get_contents($this->dir . '/request'));

        unlink($this->dir . '/request');
        $this->post('/admin/updates', ['action' => 'panel', 'channel' => 'nightly'])->assertStatus(202);
        $this->assertSame('panel-nightly', file_get_contents($this->dir . '/request'));
    }

    public function testOnlyRootAdminsCanAskForAPanelUpdate(): void
    {
        touch($this->dir . '/installed');
        $this->as($this->user(['nodes.view', 'nodes.software']))->post('/admin/updates', ['action' => 'panel'])->assertStatus(403);
        $this->assertFileDoesNotExist($this->dir . '/request');
    }

    public function testTheServiceRefusesUnknownActions(): void
    {
        touch($this->dir . '/installed');

        $this->expectException(\InvalidArgumentException::class);
        $this->app->make(ToolUpdateService::class)->request('whatever');
    }

    public function testTheStatusIsWhatTheUpdaterWrote(): void
    {
        touch($this->dir . '/installed');
        file_put_contents($this->dir . '/status.json', json_encode(['action' => 'local', 'finished_at' => '2026-10-16T10:00:00Z', 'results' => [['name' => 'mc-router', 'status' => 'updated', 'detail' => 'restarted']]]));

        $this->as($this->user([], true))->get('/admin/updates')->assertOk()->assertSee('2026-10-16T10:00:00Z');
        $this->get('/admin/updates/status')->assertOk()->assertJson(['pending' => false, 'status' => ['action' => 'local']]);
    }
}

class FakeSelfUpdate extends DaemonSelfUpdateRepository
{
    /** @var array<int, array<string, mixed>|'unreachable'> */
    public array $answers = [];

    /** @var list<int> */
    public array $updated = [];

    public function __construct()
    {
    }

    public function setNode(Node $node): self
    {
        $this->node = $node;

        return $this;
    }

    public function update(): array
    {
        $this->updated[] = $this->node->id;
        $answer = $this->answers[$this->node->id] ?? ['from' => 'a', 'to' => 'a', 'updated' => false];
        if ($answer === 'unreachable') {
            throw new DaemonConnectionException(new TransferException('connection refused'));
        }

        return $answer;
    }
}

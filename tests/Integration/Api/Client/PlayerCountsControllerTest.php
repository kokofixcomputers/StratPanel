<?php

namespace Pterodactyl\Tests\Integration\Api\Client;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Services\Minecraft\ServerListPing;
use Illuminate\Support\Facades\Cache;

class PlayerCountsControllerTest extends ClientApiIntegrationTestCase
{
    /** @var resource|null */
    private $fake = null;

    public function setUp(): void
    {
        parent::setUp();

        // The test helpers build servers on the BungeeCord egg, which this panel does not ship: borrow the first egg for it.
        if (!Egg::query()->where('author', 'support@pterodactyl.io')->where('name', 'Bungeecord')->exists()) {
            $egg = Egg::query()->firstOrFail()->replicate();
            $egg->forceFill(['uuid' => (string) \Illuminate\Support\Str::uuid(), 'author' => 'support@pterodactyl.io', 'name' => 'Bungeecord'])->save();
        }
    }

    public function tearDown(): void
    {
        if (is_resource($this->fake)) {
            proc_terminate($this->fake);
            proc_close($this->fake);
        }
        parent::tearDown();
    }

    /** A pretend Minecraft server on a free port that answers the status request with the given players. */
    private function fakeServer(int $online, int $max): int
    {
        $probe = stream_socket_server('tcp://127.0.0.1:0');
        $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1);
        fclose($probe);

        $json = json_encode(['version' => ['name' => '1.21.1'], 'players' => ['online' => $online, 'max' => $max], 'description' => 'x']);
        $reply = static::packet(chr(0) . static::varInt(strlen($json)) . $json);
        $code = '$s = stream_socket_server("tcp://127.0.0.1:' . $port . '"); for ($i = 0; $i < 20; $i++) { $c = @stream_socket_accept($s, 10); if (!$c) { break; } fread($c, 4096); fwrite($c, base64_decode("' . base64_encode($reply) . '")); fclose($c); }';
        $this->fake = proc_open([PHP_BINARY, '-r', $code], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
        // Wait until it listens.
        for ($i = 0; $i < 50; ++$i) {
            $c = @fsockopen('127.0.0.1', $port, $e, $m, 0.1);
            if ($c) {
                fclose($c);
                // That probe used one of the connections of the fake server; it answers it and goes on.
                usleep(50000);
                break;
            }
            usleep(100000);
        }

        return $port;
    }

    private static function varInt(int $v): string
    {
        $o = '';
        do {
            $b = $v & 0x7F;
            $v >>= 7;
            $o .= chr($v ? $b | 0x80 : $b);
        } while ($v);

        return $o;
    }

    private static function packet(string $body): string
    {
        return static::varInt(strlen($body)) . $body;
    }

    public function testTheStatusAnswerIsRead(): void
    {
        $json = json_encode(['version' => ['name' => 'Paper 1.21.1'], 'players' => ['online' => 3, 'max' => 20]]);
        $answer = static::packet(chr(0) . static::varInt(strlen($json)) . $json);

        $this->assertSame(['online' => 3, 'max' => 20, 'version' => 'Paper 1.21.1'], ServerListPing::parse($answer));
        // Half an answer is not an answer yet.
        $this->assertNull(ServerListPing::parse(substr($answer, 0, 10)));
        $this->assertNull(ServerListPing::parse(''));
        $this->assertNull(ServerListPing::parse(static::packet(chr(1) . 'nope')));
        $this->assertNull(ServerListPing::parse(static::packet(chr(0) . static::varInt(3) . 'abc')));
    }

    public function testASilentServerCostsOnlyTheTimeout(): void
    {
        $probe = stream_socket_server('tcp://127.0.0.1:0');
        $port = (int) substr(strrchr(stream_socket_get_name($probe, false), ':'), 1);

        $start = microtime(true);
        $result = ServerListPing::query(['a' => ['127.0.0.1', $port], 'b' => ['127.0.0.1', 1]], 0.5);
        fclose($probe);

        $this->assertSame(['a' => null, 'b' => null], $result);
        $this->assertLessThan(2.0, microtime(true) - $start);
    }

    public function testPlayerCountsOfTheServersOfThePerson(): void
    {
        [$user, $server] = $this->generateTestAccount();
        [, $stranger] = $this->generateTestAccount();
        Cache::flush();

        $port = $this->fakeServer(4, 30);
        Allocation::query()->where('id', $server->allocation_id)->update(['ip' => '127.0.0.1', 'port' => $port, 'ip_alias' => null]);

        $this->actingAs($user)
            ->getJson('/api/client/dashboard/players?servers=' . $server->uuid . ',' . $stranger->uuid . ',not-a-uuid')
            ->assertOk()
            ->assertJsonPath("attributes.{$server->uuid}.online", 4)
            ->assertJsonPath("attributes.{$server->uuid}.max", 30)
            ->assertJsonMissingPath("attributes.{$stranger->uuid}");
    }

    public function testAServerThatIsNotReadyIsNotAsked(): void
    {
        [$user, $server] = $this->generateTestAccount();
        Cache::flush();
        $server->update(['status' => 'installing']);

        $this->actingAs($user)->getJson('/api/client/dashboard/players?servers=' . $server->uuid)->assertOk()->assertJsonMissingPath("attributes.{$server->uuid}");
    }
}

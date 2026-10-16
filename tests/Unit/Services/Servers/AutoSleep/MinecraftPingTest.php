<?php

namespace Pterodactyl\Tests\Unit\Services\Servers\AutoSleep;

use PHPUnit\Framework\TestCase;
use Pterodactyl\Services\Servers\AutoSleep\MinecraftPing;

class MinecraftPingTest extends TestCase
{
    private MinecraftPing $ping;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ping = new MinecraftPing();
    }

    /** What a server sends back: the length, the id 0, the length of the text, and the text. */
    private function answer(string $json, int $id = 0): string
    {
        $body = $this->ping->varInt($id) . $this->ping->varInt(strlen($json)) . $json;

        return $this->ping->varInt(strlen($body)) . $body;
    }

    private function stream(string $bytes)
    {
        $stream = fopen('php://memory', 'r+');
        fwrite($stream, $bytes);
        rewind($stream);

        return $stream;
    }

    /** @return array<string, array{int, string}> */
    public static function varInts(): array
    {
        return [
            'zero' => [0, "\x00"],
            'one' => [1, "\x01"],
            'the biggest single byte' => [127, "\x7f"],
            'two bytes' => [128, "\x80\x01"],
            'a port' => [25565, "\xdd\xc7\x01"],
            'a big one' => [2147483647, "\xff\xff\xff\xff\x07"],
            // The game writes -1 as five bytes, it is what a client sends when it does not care about the version.
            'minus one' => [-1, "\xff\xff\xff\xff\x0f"],
        ];
    }

    /** @dataProvider varInts */
    public function testVarIntsAreWrittenTheWayTheProtocolDoes(int $value, string $bytes): void
    {
        $this->assertSame($bytes, $this->ping->varInt($value));
    }

    public function testTheRequestIsAHandshakeThatAsksForTheStatusAndTheStatusRequest(): void
    {
        $request = $this->ping->request('play.test', 25565);

        $handshake = $this->ping->varInt(0) . $this->ping->varInt(-1) . $this->ping->varInt(9) . 'play.test'
            . pack('n', 25565) . $this->ping->varInt(1);
        $this->assertSame($this->ping->varInt(strlen($handshake)) . $handshake . "\x01\x00", $request);
    }

    public function testItReadsTheNumberOfPlayers(): void
    {
        $json = json_encode(['version' => ['name' => 'Paper 1.21.1', 'protocol' => 767], 'players' => ['max' => 20, 'online' => 3]]);

        $this->assertSame(3, $this->ping->read($this->stream($this->answer($json))));
    }

    public function testNobodyOnlineIsZeroNotUnknown(): void
    {
        $this->assertSame(0, $this->ping->read($this->stream($this->answer('{"players":{"max":20,"online":0}}'))));
    }

    public function testAnAnswerWithAnIconAndTextBiggerThanOneReadIsStillRead(): void
    {
        $json = json_encode(['players' => ['online' => 7], 'favicon' => 'data:image/png;base64,' . str_repeat('A', 60000)]);

        $this->assertSame(7, $this->ping->read($this->stream($this->answer($json))));
    }

    /** @return array<string, array{string}> */
    public static function nonsense(): array
    {
        return [
            'nothing' => [''],
            'a length with nothing behind it' => ["\x10"],
            'not json' => ['<html>this is a web server</html>'],
            'json without players' => ['{"version":{"name":"x"}}'],
            'players that are not a number' => ['{"players":{"online":"3"}}'],
            'a negative number' => ['{"players":{"online":-1}}'],
            'an array' => ['[1,2,3]'],
        ];
    }

    /** @dataProvider nonsense */
    public function testAnythingElseIsNotKnown(string $text): void
    {
        $bytes = str_starts_with($text, "\x10") || $text === '' ? $text : $this->answer($text);

        $this->assertNull($this->ping->read($this->stream($bytes)));
    }

    public function testAnotherKindOfPacketIsNotAStatus(): void
    {
        $this->assertNull($this->ping->read($this->stream($this->answer('{"players":{"online":2}}', 1))));
    }

    public function testAnAnswerThatIsAbsurdlyLongIsRefused(): void
    {
        // A length of 100 MB: a server that is not a Minecraft server, which would otherwise be read for ever.
        $this->assertNull($this->ping->read($this->stream($this->ping->varInt(100_000_000) . 'x')));
    }

    public function testAnAnswerThatEndsHalfWayIsNotKnown(): void
    {
        $whole = $this->answer('{"players":{"online":4}}');

        $this->assertNull($this->ping->read($this->stream(substr($whole, 0, -5))));
    }

    public function testAServerThatIsNotThereIsNotKnown(): void
    {
        // Nothing listens on port 1 of this machine.
        $this->assertNull($this->ping->players('127.0.0.1', 1, 0.3));
    }

    public function testItTalksToARealServer(): void
    {
        if (!function_exists('proc_open')) {
            $this->markTestSkipped('proc_open is not available');
        }

        // A little server in another process: it waits for the status request and answers with 5 players, the way a game
        // server does.
        $script = <<<'PHP'
        $server = stream_socket_server('tcp://127.0.0.1:0', $e, $m);
        echo stream_socket_get_name($server, false), "\n";
        $client = stream_socket_accept($server, 5);
        $request = '';
        $stop = microtime(true) + 3;
        while (strlen($request) < 20 && microtime(true) < $stop) { $request .= (string) fread($client, 512); if ($request !== '' && str_ends_with($request, "\x01\x00")) break; }
        $json = json_encode(['players' => ['max' => 20, 'online' => 5]]);
        $body = chr(0) . chr(strlen($json)) . $json;
        fwrite($client, chr(strlen($body)) . $body);
        fclose($client);
        PHP;
        $process = proc_open([PHP_BINARY, '-r', $script], [1 => ['pipe', 'w']], $pipes);
        $this->assertIsResource($process);

        $address = trim((string) fgets($pipes[1]));
        [$host, $port] = explode(':', $address);

        $this->assertSame(5, $this->ping->players($host, (int) $port, 3.0));

        fclose($pipes[1]);
        proc_close($process);
    }
}

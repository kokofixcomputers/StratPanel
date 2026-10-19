<?php

namespace Pterodactyl\Services\Minecraft;

/**
 * Asks Minecraft servers how many players are online with the "server list ping" every game client sends to fill its server list. It
 * needs nothing installed on the server, only that the panel can reach the game port. Many servers are asked at the same time.
 */
class ServerListPing
{
    /** The protocol number sent in the handshake; servers answer every client the same way for the status. */
    private const PROTOCOL = 767;

    /** The most a status answer may be (the icon makes it big), anything longer is not read. */
    private const MAX_BYTES = 262144;

    /** The handshake and the status request, as the client sends them. */
    public static function request(string $host, int $port): string
    {
        $handshake = self::varInt(0) . self::varInt(self::PROTOCOL) . self::varInt(strlen($host)) . $host . pack('n', $port) . self::varInt(1);

        return self::varInt(strlen($handshake)) . $handshake . self::varInt(1) . self::varInt(0);
    }

    /**
     * What the server answered, as {online, max, version, motd}, null while it is not (all) there or not an answer.
     *
     * @return array{online: int, max: int, version: string|null}|null
     */
    public static function parse(string $buffer): ?array
    {
        $at = 0;
        $length = self::readVarInt($buffer, $at);
        if ($length === null || $length < 1 || $length > self::MAX_BYTES || strlen($buffer) - $at < $length) {
            return null;
        }
        $end = $at + $length;
        if (self::readVarInt($buffer, $at) !== 0) {
            return null;
        }
        $size = self::readVarInt($buffer, $at);
        if ($size === null || $size < 2 || $at + $size > $end) {
            return null;
        }
        $json = json_decode(substr($buffer, $at, $size), true);
        if (!is_array($json) || !isset($json['players']['online'])) {
            return null;
        }

        return [
            'online' => max(0, (int) $json['players']['online']),
            'max' => max(0, (int) ($json['players']['max'] ?? 0)),
            'version' => is_string($json['version']['name'] ?? null) ? mb_substr($json['version']['name'], 0, 40) : null,
        ];
    }

    /**
     * Asks every target at once and waits at most $timeout seconds in all.
     *
     * @param array<string, array{0: string, 1: int}> $targets key => [host, port]
     *
     * @return array<string, array{online: int, max: int, version: string|null}|null> null for the ones that did not answer
     */
    public static function query(array $targets, float $timeout = 2.0): array
    {
        $results = array_fill_keys(array_keys($targets), null);
        $sockets = [];
        $state = [];

        foreach ($targets as $key => [$host, $port]) {
            $socket = @stream_socket_client('tcp://' . (str_contains($host, ':') ? "[$host]" : $host) . ':' . $port, $errno, $error, 0, STREAM_CLIENT_CONNECT | STREAM_CLIENT_ASYNC_CONNECT);
            if (!$socket) {
                continue;
            }
            stream_set_blocking($socket, false);
            $sockets[$key] = $socket;
            $state[$key] = ['out' => self::request($host, $port), 'in' => ''];
        }

        $deadline = microtime(true) + $timeout;
        while ($sockets && microtime(true) < $deadline) {
            $read = $sockets;
            $write = array_filter($sockets, fn ($key) => $state[$key]['out'] !== '', ARRAY_FILTER_USE_KEY);
            $except = null;
            $wait = max(0, $deadline - microtime(true));
            if (@stream_select($read, $write, $except, (int) $wait, (int) (($wait - (int) $wait) * 1000000)) === false) {
                break;
            }

            foreach ($write as $socket) {
                $key = array_search($socket, $sockets, true);
                if ($key === false) {
                    continue;
                }
                $written = @fwrite($socket, $state[$key]['out']);
                if ($written === false) {
                    self::close($sockets, $key);
                    continue;
                }
                $state[$key]['out'] = (string) substr($state[$key]['out'], $written);
            }

            foreach ($read as $socket) {
                $key = array_search($socket, $sockets, true);
                if ($key === false) {
                    continue;
                }
                $chunk = @fread($socket, 65536);
                if ($chunk === false || ($chunk === '' && feof($socket))) {
                    self::close($sockets, $key);
                    continue;
                }
                $state[$key]['in'] .= $chunk;
                if (strlen($state[$key]['in']) > self::MAX_BYTES) {
                    self::close($sockets, $key);
                    continue;
                }
                $parsed = self::parse($state[$key]['in']);
                if ($parsed !== null) {
                    $results[$key] = $parsed;
                    self::close($sockets, $key);
                }
            }
        }

        foreach (array_keys($sockets) as $key) {
            self::close($sockets, $key);
        }

        return $results;
    }

    private static function close(array &$sockets, $key): void
    {
        if (isset($sockets[$key])) {
            @fclose($sockets[$key]);
            unset($sockets[$key]);
        }
    }

    private static function varInt(int $value): string
    {
        $out = '';
        do {
            $byte = $value & 0x7F;
            $value >>= 7;
            $out .= chr($value ? $byte | 0x80 : $byte);
        } while ($value);

        return $out;
    }

    private static function readVarInt(string $buffer, int &$at): ?int
    {
        $result = 0;
        for ($shift = 0; $shift < 35; $shift += 7) {
            if ($at >= strlen($buffer)) {
                return null;
            }
            $byte = ord($buffer[$at++]);
            $result |= ($byte & 0x7F) << $shift;
            if (!($byte & 0x80)) {
                return $result;
            }
        }

        return null;
    }
}

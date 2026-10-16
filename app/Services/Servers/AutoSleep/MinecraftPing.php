<?php

namespace Pterodactyl\Services\Servers\AutoSleep;

/**
 * Asks a Java Edition server how many players are online, the way the server list of the game does: a handshake, then a status
 * request, and the answer is a piece of JSON. It needs nothing installed on the server.
 */
class MinecraftPing
{
    /** What the server list of the game sends as the version when it only wants the status, which every server answers. */
    private const PROTOCOL = -1;

    /**
     * The number of players online, or null when the server did not answer (it is starting, stopping or not a Java server).
     */
    public function players(string $host, int $port, float $timeout = 2.0): ?int
    {
        $stream = @stream_socket_client(
            sprintf('tcp://%s:%d', $host, $port),
            $errorCode,
            $errorMessage,
            $timeout
        );
        if ($stream === false) {
            return null;
        }

        try {
            stream_set_timeout($stream, (int) ceil($timeout));
            fwrite($stream, $this->request($host, $port));

            return $this->read($stream);
        } finally {
            fclose($stream);
        }
    }

    /** The bytes the server list of the game sends: the handshake that asks for the status, and the empty status request. */
    public function request(string $host, int $port): string
    {
        $handshake = $this->varInt(0) . $this->varInt(self::PROTOCOL) . $this->varInt(strlen($host)) . $host
            . pack('n', $port) . $this->varInt(1);

        return $this->varInt(strlen($handshake)) . $handshake . $this->varInt(1) . $this->varInt(0);
    }

    /**
     * Reads the answer from a stream. Public so it can be tried on a stream that is not a connection.
     *
     * @param  resource  $stream
     */
    public function read($stream): ?int
    {
        $length = $this->readVarInt($stream);
        // A status answer is a few hundred bytes up to a few hundred kilobytes (it can carry the icon of the server).
        if ($length === null || $length < 2 || $length > 1_048_576) {
            return null;
        }

        $body = '';
        while (strlen($body) < $length) {
            $chunk = fread($stream, $length - strlen($body));
            if ($chunk === false || $chunk === '') {
                return null;
            }
            $body .= $chunk;
        }

        $memory = fopen('php://memory', 'r+');
        fwrite($memory, $body);
        rewind($memory);
        try {
            if ($this->readVarInt($memory) !== 0) {
                return null;
            }
            $size = $this->readVarInt($memory);
            if ($size === null || $size < 2) {
                return null;
            }

            return $this->parse((string) stream_get_contents($memory, $size));
        } finally {
            fclose($memory);
        }
    }

    /** The players that are online in the JSON of a status answer, null when it does not say. */
    public function parse(string $json): ?int
    {
        $data = json_decode($json, true);
        $online = is_array($data) ? ($data['players']['online'] ?? null) : null;

        return is_int($online) && $online >= 0 ? $online : null;
    }

    public function varInt(int $value): string
    {
        // A negative number is written as the 32 bit number it is the same as, the protocol does it this way.
        $value &= 0xFFFFFFFF;
        $bytes = '';
        do {
            $byte = $value & 0x7F;
            $value >>= 7;
            $bytes .= chr($value !== 0 ? $byte | 0x80 : $byte);
        } while ($value !== 0);

        return $bytes;
    }

    /** @param  resource  $stream */
    private function readVarInt($stream): ?int
    {
        $result = 0;
        for ($shift = 0; $shift < 35; $shift += 7) {
            $byte = fread($stream, 1);
            if ($byte === false || $byte === '') {
                return null;
            }
            $value = ord($byte);
            $result |= ($value & 0x7F) << $shift;
            if (($value & 0x80) === 0) {
                return $result;
            }
        }

        return null;
    }
}

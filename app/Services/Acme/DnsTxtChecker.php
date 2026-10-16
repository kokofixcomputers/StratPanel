<?php

namespace Pterodactyl\Services\Acme;

use Illuminate\Support\Facades\Http;

/**
 * Looks up whether a TXT record exists, the way Let's Encrypt does: by asking the authoritative nameservers of the domain directly.
 * A public resolver would not do: it remembers "does not exist" from the first look (before the record was added) for as long as the
 * zone allows, often half an hour, and the check would go on failing after the record is there. Only when the nameservers can not be
 * found or reached does it fall back to a public resolver over https.
 */
class DnsTxtChecker
{
    public function has(string $name, string $value): bool
    {
        $name = rtrim(strtolower($name), '.');

        $servers = $this->nameserverAddresses($name);
        if ($servers !== []) {
            $answered = 0;
            foreach ($servers as $ip) {
                $response = $this->query($ip, self::buildQuery($name));
                if ($response === null) {
                    continue; // unreachable, the others decide
                }
                ++$answered;
                if (!in_array($value, self::parseTxt($response), true)) {
                    return false; // one that is behind: Let's Encrypt may ask this one
                }
            }
            if ($answered > 0) {
                return true;
            }
        }

        return $this->viaResolver($name, $value);
    }

    /**
     * The addresses of the nameservers of the zone that holds the name: the first parent of it that has NS records.
     *
     * @return list<string>
     */
    protected function nameserverAddresses(string $name): array
    {
        $labels = explode('.', $name);
        while (count($labels) > 2) {
            array_shift($labels);
            $records = @dns_get_record(implode('.', $labels), DNS_NS) ?: [];
            if ($records === []) {
                continue;
            }

            $ips = [];
            foreach ($records as $record) {
                foreach (@dns_get_record((string) $record['target'], DNS_A) ?: [] as $a) {
                    $ips[] = (string) $a['ip'];
                }
            }

            return array_values(array_unique($ips));
        }

        return [];
    }

    /** Sends one UDP packet to a nameserver and returns its answer, null if there is none. */
    protected function query(string $ip, string $packet): ?string
    {
        $socket = @stream_socket_client('udp://' . $ip . ':53', $errno, $error, 3);
        if ($socket === false) {
            return null;
        }
        stream_set_timeout($socket, 3);
        fwrite($socket, $packet);
        $response = fread($socket, 4096);
        fclose($socket);

        return $response === false || strlen($response) < 12 ? null : $response;
    }

    /** A TXT question for a name, without recursion (the server is the authority, it knows). */
    public static function buildQuery(string $name, int $id = 0): string
    {
        $packet = pack('nnnnnn', $id ?: random_int(1, 65535), 0x0000, 1, 0, 0, 0);
        foreach (explode('.', $name) as $label) {
            $packet .= chr(strlen($label)) . $label;
        }

        return $packet . "\0" . pack('nn', 16, 1);
    }

    /**
     * The TXT strings in the answer of a nameserver (the pieces of one record joined).
     *
     * @return list<string>
     */
    public static function parseTxt(string $response): array
    {
        if (strlen($response) < 12) {
            return [];
        }
        $header = unpack('nid/nflags/nqd/nan', $response);
        $offset = 12;
        for ($i = 0; $i < $header['qd']; ++$i) {
            $offset = self::skipName($response, $offset) + 4;
        }

        $texts = [];
        for ($i = 0; $i < $header['an'] && $offset < strlen($response); ++$i) {
            $offset = self::skipName($response, $offset);
            if ($offset + 10 > strlen($response)) {
                break;
            }
            $record = unpack('ntype/nclass/Nttl/nlength', substr($response, $offset, 10));
            $offset += 10;
            if ($record['type'] === 16) {
                $data = substr($response, $offset, $record['length']);
                $text = '';
                for ($p = 0; $p < strlen($data);) {
                    $length = ord($data[$p]);
                    $text .= substr($data, $p + 1, $length);
                    $p += 1 + $length;
                }
                $texts[] = $text;
            }
            $offset += $record['length'];
        }

        return $texts;
    }

    /** The offset after a name in a DNS message (names can be a pointer to an earlier one). */
    private static function skipName(string $message, int $offset): int
    {
        while ($offset < strlen($message)) {
            $length = ord($message[$offset]);
            if ($length === 0) {
                return $offset + 1;
            }
            if (($length & 0xC0) === 0xC0) {
                return $offset + 2;
            }
            $offset += 1 + $length;
        }

        return $offset;
    }

    private function viaResolver(string $name, string $value): bool
    {
        try {
            $response = Http::timeout(8)->withHeaders(['Accept' => 'application/dns-json'])
                ->get('https://cloudflare-dns.com/dns-query', ['name' => $name, 'type' => 'TXT']);
        } catch (\Throwable) {
            return false;
        }
        if (!$response->successful()) {
            return false;
        }

        foreach ((array) $response->json('Answer', []) as $answer) {
            // TXT data comes back in quotes, long values in several quoted pieces.
            if (str_replace(['"', ' '], '', (string) ($answer['data'] ?? '')) === $value) {
                return true;
            }
        }

        return false;
    }
}

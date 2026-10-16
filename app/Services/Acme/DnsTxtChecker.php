<?php

namespace Pterodactyl\Services\Acme;

use Illuminate\Support\Facades\Http;

/**
 * Looks up whether a TXT record is visible on the internet, with a public resolver (over https, so nothing on this machine caches an
 * old answer). Let's Encrypt asks the authoritative servers itself, this is only to know when it is worth asking.
 */
class DnsTxtChecker
{
    public function has(string $name, string $value): bool
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
            $data = str_replace(['"', ' '], '', (string) ($answer['data'] ?? ''));
            if ($data === $value) {
                return true;
            }
        }

        return false;
    }
}

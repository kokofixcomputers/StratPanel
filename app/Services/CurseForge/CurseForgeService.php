<?php

namespace Pterodactyl\Services\CurseForge;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\Client\ConnectionException;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * Talks to the CurseForge API for the panel. CurseForge only answers requests that carry the key of an application, and the
 * key must stay secret, so the browser never calls CurseForge itself: it asks the panel, which asks CurseForge. The key is
 * set by an admin (Settings > CurseForge), it is stored encrypted in the settings table. Answers are cached for a while, the
 * same mod is asked for by many people and CurseForge limits how often a key may be used.
 */
class CurseForgeService
{
    public const KEY = 'settings::curseforge:api_key';

    /** CurseForge's number for Minecraft. */
    public const GAME_ID = 432;

    private const BASE = 'https://api.curseforge.com';

    public function __construct(
        private SettingsRepositoryInterface $settings,
        private HttpFactory $http,
        private Cache $cache,
        private Encrypter $encrypter,
    ) {
    }

    /** The key in use: the one an admin saved, otherwise CURSEFORGE_API_KEY from the environment. */
    public function apiKey(): ?string
    {
        $stored = (string) $this->settings->get(self::KEY, '');
        if ($stored !== '') {
            try {
                return $this->encrypter->decryptString($stored);
            } catch (DecryptException) {
                // The application key changed since it was saved, the admin has to enter it again.
            }
        }

        $environment = (string) config('services.curseforge.key', '');

        return $environment !== '' ? $environment : null;
    }

    public function enabled(): bool
    {
        return $this->apiKey() !== null;
    }

    /** Whether the key comes from the environment, which the admin page cannot change. */
    public function fromEnvironment(): bool
    {
        return (string) $this->settings->get(self::KEY, '') === '' && $this->apiKey() !== null;
    }

    public function setKey(string $key): void
    {
        $this->settings->set(self::KEY, $this->encrypter->encryptString(trim($key)));
    }

    public function clearKey(): void
    {
        $this->settings->forget(self::KEY);
    }

    /**
     * GET a path of the API. The answer is the decoded JSON.
     *
     * @param  array<string, mixed>  $query
     *
     * @throws CurseForgeException
     */
    public function get(string $path, array $query = [], int $ttl = 300): array
    {
        return $this->remember('GET', $path, $query, $ttl, fn (string $key) => $this->client($key)->get(self::BASE . $path, $query));
    }

    /**
     * POST a JSON body to a path of the API. Reading things in bulk is a POST, nothing is changed at CurseForge.
     *
     * @param  array<string, mixed>  $body
     *
     * @throws CurseForgeException
     */
    public function post(string $path, array $body, int $ttl = 300): array
    {
        return $this->remember('POST', $path, $body, $ttl, fn (string $key) => $this->client($key)->post(self::BASE . $path, $body));
    }

    /**
     * Checks that the key is accepted, the answer says what to tell the admin.
     *
     * @return array{ok: bool, message: string}
     */
    public function verify(): array
    {
        try {
            $game = $this->get('/v1/games/' . self::GAME_ID, [], 0);

            return ['ok' => true, 'message' => 'CurseForge accepted the key (' . ($game['data']['name'] ?? 'Minecraft') . ').'];
        } catch (CurseForgeException $exception) {
            return ['ok' => false, 'message' => $exception->getMessage()];
        }
    }

    private function client(string $key): \Illuminate\Http\Client\PendingRequest
    {
        return $this->http
            ->withHeaders(['x-api-key' => $key, 'Accept' => 'application/json'])
            ->timeout(15)
            ->connectTimeout(5);
    }

    /** @param callable(string): \Illuminate\Http\Client\Response $send */
    private function remember(string $method, string $path, array $payload, int $ttl, callable $send): array
    {
        $key = $this->apiKey();
        if ($key === null) {
            throw new CurseForgeException('CurseForge is not set up on this panel. An admin has to add an API key.', 503);
        }

        // The key is not part of the name, a changed key is no reason to ask again.
        $name = 'curseforge:' . sha1($method . $path . json_encode($payload));
        if ($ttl > 0 && ($cached = $this->cache->get($name)) !== null) {
            return $cached;
        }

        try {
            $response = $send($key);
            // CurseForge limits how often a key may be used, one more try after a short wait is usually enough.
            if ($response->status() === 429) {
                usleep(800_000);
                $response = $send($key);
            }
        } catch (ConnectionException) {
            throw new CurseForgeException('CurseForge could not be reached, please try again in a moment.', 502);
        }

        if ($response->status() === 401 || $response->status() === 403) {
            throw new CurseForgeException('CurseForge did not accept the API key of this panel. An admin has to check it.', 502);
        }
        if ($response->status() === 404) {
            throw new CurseForgeException('That was not found on CurseForge.', 404);
        }
        if ($response->status() === 429) {
            throw new CurseForgeException('CurseForge is busy, please try again in a moment.', 429);
        }
        if (!$response->successful()) {
            throw new CurseForgeException('CurseForge answered with an error (' . $response->status() . '), please try again later.', 502);
        }

        $data = $response->json();
        if (!is_array($data)) {
            throw new CurseForgeException('CurseForge sent an answer that could not be read.', 502);
        }
        if ($ttl > 0) {
            $this->cache->put($name, $data, $ttl);
        }

        return $data;
    }
}

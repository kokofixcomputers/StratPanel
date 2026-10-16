<?php

namespace Pterodactyl\Services\Auth\OAuth;

use Illuminate\Support\Arr;
use Pterodactyl\Models\AuthProvider;
use Illuminate\Http\Client\Factory as HttpFactory;

/**
 * The two steps of OAuth 2 (authorization code) that need the service: sending the person there, and turning what comes back into
 * who they are.
 */
class OAuthClient
{
    public function __construct(private HttpFactory $http)
    {
    }

    public function authorizeUrl(AuthProvider $provider, string $state, string $redirectUri): string
    {
        $endpoints = ProviderCatalog::endpointsOf($provider);
        $query = array_filter([
            'client_id' => $provider->client_id,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $endpoints['scopes'],
            'state' => $state,
        ], fn ($value) => $value !== '');

        $base = $endpoints['authorize_url'];

        return $base . (str_contains($base, '?') ? '&' : '?') . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Trades the code for the details of the person.
     *
     * @throws OAuthException
     */
    public function profile(AuthProvider $provider, string $code, string $redirectUri): OAuthProfile
    {
        $endpoints = ProviderCatalog::endpointsOf($provider);
        $token = $this->token($provider, $endpoints['token_url'], $code, $redirectUri);

        $data = $this->get($endpoints['userinfo_url'], $token, 'profile');
        $mapping = $endpoints['mapping'];

        $id = $this->scalar($data, $mapping['id'] ?? null);
        if ($id === null || $id === '') {
            throw new OAuthException('profile', 'The service did not say who you are (no "' . ($mapping['id'] ?? 'id') . '" in its answer).');
        }

        $email = $this->scalar($data, $mapping['email'] ?? null);
        $verified = $this->flag($data, $mapping['email_verified'] ?? null);

        // GitHub only gives the public address, if any. The private ones are on another page, and only the checked ones count.
        if ($provider->type === 'github' && ($email === null || $email === '')) {
            [$email, $verified] = $this->githubEmail($token);
        }

        return new OAuthProfile(
            $id,
            $email === '' ? null : $email,
            $email === null || $email === '' ? null : $verified,
            $this->scalar($data, $mapping['username'] ?? null),
            $this->scalar($data, $mapping['name'] ?? null),
        );
    }

    /** @throws OAuthException */
    private function token(AuthProvider $provider, string $url, string $code, string $redirectUri): string
    {
        try {
            $response = $this->http->asForm()->acceptJson()->timeout(15)->post($url, [
                'grant_type' => 'authorization_code',
                'code' => $code,
                'redirect_uri' => $redirectUri,
                'client_id' => $provider->client_id,
                'client_secret' => $provider->client_secret,
            ]);
        } catch (\Throwable) {
            throw new OAuthException('token', 'The service could not be reached.');
        }

        $token = $response->json('access_token');
        if (!$response->successful() || !is_string($token) || $token === '') {
            throw new OAuthException('token', 'The service did not accept the code.');
        }

        return $token;
    }

    /** @return array<string, mixed> @throws OAuthException */
    private function get(string $url, string $token, string $reason): array
    {
        try {
            $response = $this->http->withToken($token)->acceptJson()->withHeaders(['User-Agent' => 'Stratosphere'])->timeout(15)->get($url);
        } catch (\Throwable) {
            throw new OAuthException($reason, 'The service could not be reached.');
        }

        $data = $response->json();
        if (!$response->successful() || !is_array($data)) {
            throw new OAuthException($reason, 'The service did not answer with your details.');
        }

        return $data;
    }

    /** @return array{0: string|null, 1: bool|null} */
    private function githubEmail(string $token): array
    {
        try {
            $emails = $this->get('https://api.github.com/user/emails', $token, 'profile');
        } catch (OAuthException) {
            return [null, null];
        }

        $verified = array_values(array_filter($emails, fn ($row) => is_array($row) && ($row['verified'] ?? false) === true && is_string($row['email'] ?? null)));
        foreach ($verified as $row) {
            if (($row['primary'] ?? false) === true) {
                return [$row['email'], true];
            }
        }

        return isset($verified[0]) ? [$verified[0]['email'], true] : [null, null];
    }

    /** A value of the answer as text, for a field name or a path with dots. */
    private function scalar(array $data, ?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }
        $value = Arr::get($data, $path);

        return is_string($value) || is_int($value) ? (string) $value : null;
    }

    private function flag(array $data, ?string $path): ?bool
    {
        if ($path === null || $path === '') {
            return null;
        }
        $value = Arr::get($data, $path);

        return is_bool($value) ? $value : (in_array($value, ['true', 'false'], true) ? $value === 'true' : null);
    }
}

<?php

namespace Pterodactyl\Services\Auth\OAuth;

use Pterodactyl\Models\AuthProvider;

/**
 * The services the admin can pick from, with their addresses and where in their answers the details of the person are. "oauth2"
 * is any other service: the admin enters the same things by hand.
 */
final class ProviderCatalog
{
    public const GENERIC = 'oauth2';

    /** @var array<string, array<string, mixed>> */
    private const TYPES = [
        'github' => [
            'name' => 'GitHub',
            'authorize_url' => 'https://github.com/login/oauth/authorize',
            'token_url' => 'https://github.com/login/oauth/access_token',
            'userinfo_url' => 'https://api.github.com/user',
            'scopes' => 'read:user user:email',
            'mapping' => ['id' => 'id', 'email' => 'email', 'username' => 'login', 'name' => 'name', 'email_verified' => null],
            'docs' => 'https://github.com/settings/developers',
        ],
        'google' => [
            'name' => 'Google',
            'authorize_url' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'token_url' => 'https://oauth2.googleapis.com/token',
            'userinfo_url' => 'https://openidconnect.googleapis.com/v1/userinfo',
            'scopes' => 'openid email profile',
            'mapping' => ['id' => 'sub', 'email' => 'email', 'username' => null, 'name' => 'name', 'email_verified' => 'email_verified'],
            'docs' => 'https://console.cloud.google.com/apis/credentials',
        ],
        'discord' => [
            'name' => 'Discord',
            'authorize_url' => 'https://discord.com/oauth2/authorize',
            'token_url' => 'https://discord.com/api/oauth2/token',
            'userinfo_url' => 'https://discord.com/api/users/@me',
            'scopes' => 'identify email',
            'mapping' => ['id' => 'id', 'email' => 'email', 'username' => 'username', 'name' => 'global_name', 'email_verified' => 'verified'],
            'docs' => 'https://discord.com/developers/applications',
        ],
        'microsoft' => [
            'name' => 'Microsoft',
            'authorize_url' => 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            'token_url' => 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            'userinfo_url' => 'https://graph.microsoft.com/oidc/userinfo',
            'scopes' => 'openid email profile',
            'mapping' => ['id' => 'sub', 'email' => 'email', 'username' => null, 'name' => 'name', 'email_verified' => null],
            'docs' => 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
        ],
        'gitlab' => [
            'name' => 'GitLab',
            'authorize_url' => 'https://gitlab.com/oauth/authorize',
            'token_url' => 'https://gitlab.com/oauth/token',
            'userinfo_url' => 'https://gitlab.com/oauth/userinfo',
            'scopes' => 'openid email profile',
            'mapping' => ['id' => 'sub', 'email' => 'email', 'username' => 'nickname', 'name' => 'name', 'email_verified' => 'email_verified'],
            'docs' => 'https://gitlab.com/-/user_settings/applications',
        ],
        self::GENERIC => [
            'name' => 'OAuth 2',
            'authorize_url' => '',
            'token_url' => '',
            'userinfo_url' => '',
            'scopes' => 'openid email profile',
            'mapping' => ['id' => 'sub', 'email' => 'email', 'username' => 'preferred_username', 'name' => 'name', 'email_verified' => 'email_verified'],
            'docs' => null,
        ],
    ];

    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        return self::TYPES;
    }

    public static function has(string $type): bool
    {
        return isset(self::TYPES[$type]);
    }

    /** @return array<string, mixed> */
    public static function preset(string $type): array
    {
        return self::TYPES[$type] ?? self::TYPES[self::GENERIC];
    }

    /**
     * The addresses and field names of a provider: the preset of its type, or what the admin entered for "oauth2".
     *
     * @return array{authorize_url: string, token_url: string, userinfo_url: string, scopes: string, mapping: array<string, string|null>}
     */
    public static function endpointsOf(AuthProvider $provider): array
    {
        $preset = self::preset($provider->type);
        if ($provider->type !== self::GENERIC) {
            return [
                'authorize_url' => $preset['authorize_url'],
                'token_url' => $preset['token_url'],
                'userinfo_url' => $preset['userinfo_url'],
                'scopes' => trim((string) ($provider->scopes ?: $preset['scopes'])),
                'mapping' => $preset['mapping'],
            ];
        }

        $custom = (array) $provider->endpoints;
        $mapping = array_replace($preset['mapping'], array_filter((array) ($custom['mapping'] ?? []), fn ($v) => is_string($v) && $v !== ''));

        return [
            'authorize_url' => (string) ($custom['authorize_url'] ?? ''),
            'token_url' => (string) ($custom['token_url'] ?? ''),
            'userinfo_url' => (string) ($custom['userinfo_url'] ?? ''),
            'scopes' => trim((string) ($provider->scopes ?? $preset['scopes'])),
            'mapping' => $mapping,
        ];
    }
}

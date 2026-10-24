<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Pterodactyl\Models\AuthProvider;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Auth\OAuth\OAuthService;
use Pterodactyl\Services\Auth\OAuth\ProviderCatalog;

/** The services people can sign in with (GitHub, Google, Discord, any OAuth 2 service), for the admin pages. */
class ProvidersController extends Controller
{
    public function __construct(private OAuthService $oauth)
    {
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'providers' => AuthProvider::query()->withCount('identities')->orderBy('id')->get()->map(fn (AuthProvider $provider) => [
                'id' => $provider->id,
                'name' => $provider->name,
                'key' => $provider->key,
                'type' => $provider->type,
                'enabled' => (bool) $provider->enabled,
                'allow_signup' => (bool) $provider->allow_signup,
                'accounts' => (int) $provider->identities_count,
            ])->values()->all(),
            'types' => collect(ProviderCatalog::all())->map(fn (array $type, string $key) => ['type' => $key, 'name' => $type['name'], 'docs' => $type['docs'] ?? null])->values()->all(),
        ]);
    }

    /** What a form for a new provider of a type starts with. */
    public function blank(Request $request): JsonResponse
    {
        $type = (string) $request->query('type');
        abort_unless(ProviderCatalog::has($type), 404);

        return new JsonResponse($this->form(new AuthProvider(['type' => $type, 'key' => $type === ProviderCatalog::GENERIC ? '' : $type, 'enabled' => true, 'allow_signup' => true]), false));
    }

    public function view(int $provider): JsonResponse
    {
        return new JsonResponse($this->form(AuthProvider::query()->findOrFail($provider), true));
    }

    public function store(Request $request): JsonResponse
    {
        $type = (string) $request->input('type');
        abort_unless(ProviderCatalog::has($type), 404);

        $data = $request->validate($this->rules($type, null));
        $provider = AuthProvider::query()->create($this->attributes($request, $type, $data, null));

        return new JsonResponse($this->form($provider, true), 201);
    }

    public function update(Request $request, int $provider): JsonResponse
    {
        $found = AuthProvider::query()->findOrFail($provider);
        $data = $request->validate($this->rules($found->type, $found));
        $found->forceFill($this->attributes($request, $found->type, $data, $found))->save();

        return new JsonResponse($this->form($found->refresh(), true));
    }

    public function destroy(int $provider): JsonResponse
    {
        AuthProvider::query()->findOrFail($provider)->delete();

        return new JsonResponse([], 204);
    }

    /** @return array<string, mixed> */
    private function form(AuthProvider $provider, bool $exists): array
    {
        $preset = ProviderCatalog::preset($provider->type);
        $endpoints = ProviderCatalog::endpointsOf($provider);

        return [
            'id' => $exists ? $provider->id : null,
            'type' => $provider->type,
            'preset' => ['name' => $preset['name'], 'docs' => $preset['docs'] ?? null],
            'name' => $provider->name ?: $preset['name'],
            'key' => $provider->key,
            'client_id' => (string) $provider->client_id,
            'secret_saved' => $exists && (string) $provider->client_secret !== '',
            'scopes' => (string) ($provider->scopes ?? ''),
            'default_scopes' => $endpoints['scopes'],
            'enabled' => (bool) $provider->enabled,
            'allow_signup' => (bool) $provider->allow_signup,
            'generic' => $provider->type === ProviderCatalog::GENERIC,
            'authorize_url' => $endpoints['authorize_url'],
            'token_url' => $endpoints['token_url'],
            'userinfo_url' => $endpoints['userinfo_url'],
            'mapping' => $endpoints['mapping'],
            'callback' => $exists ? $this->oauth->callbackUrl($provider) : url('/auth/oauth/' . ($provider->key ?: '<key>') . '/callback'),
        ];
    }

    /** @return array<string, mixed> */
    private function rules(string $type, ?AuthProvider $existing): array
    {
        $rules = [
            'name' => 'required|string|max:60',
            'client_id' => 'required|string|max:255',
            'client_secret' => [$existing === null ? 'required' : 'nullable', 'string', 'max:1000'],
            'scopes' => 'nullable|string|max:255|regex:/^[\x21\x23-\x5B\x5D-\x7E ]*$/',
            'enabled' => 'nullable|boolean',
            'allow_signup' => 'nullable|boolean',
        ];

        if ($existing === null) {
            $rules['key'] = ['required', 'regex:' . AuthProvider::KEY_REGEX, Rule::unique('auth_providers', 'key')];
        }
        if ($type === ProviderCatalog::GENERIC) {
            $rules += [
                'authorize_url' => ['required', 'url', 'max:500', 'starts_with:https://,http://'],
                'token_url' => ['required', 'url', 'max:500', 'starts_with:https://,http://'],
                'userinfo_url' => ['required', 'url', 'max:500', 'starts_with:https://,http://'],
                'map_id' => 'nullable|string|max:100',
                'map_email' => 'nullable|string|max:100',
                'map_username' => 'nullable|string|max:100',
                'map_name' => 'nullable|string|max:100',
                'map_email_verified' => 'nullable|string|max:100',
            ];
        }

        return $rules;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function attributes(Request $request, string $type, array $data, ?AuthProvider $existing): array
    {
        $attributes = [
            'type' => $type,
            'name' => $data['name'],
            'client_id' => trim($data['client_id']),
            'scopes' => ($data['scopes'] ?? '') !== '' ? trim($data['scopes']) : null,
            'enabled' => $request->boolean('enabled'),
            'allow_signup' => $request->boolean('allow_signup'),
        ];
        if ($existing === null) {
            $attributes['key'] = $data['key'];
        }
        // Left empty while editing means "keep the one that is saved".
        if (!empty($data['client_secret'])) {
            $attributes['client_secret'] = trim($data['client_secret']);
        }
        if ($type === ProviderCatalog::GENERIC) {
            $attributes['endpoints'] = [
                'authorize_url' => $data['authorize_url'],
                'token_url' => $data['token_url'],
                'userinfo_url' => $data['userinfo_url'],
                'mapping' => array_filter([
                    'id' => $data['map_id'] ?? null,
                    'email' => $data['map_email'] ?? null,
                    'username' => $data['map_username'] ?? null,
                    'name' => $data['map_name'] ?? null,
                    'email_verified' => $data['map_email_verified'] ?? null,
                ], fn ($value) => is_string($value) && trim($value) !== ''),
            ];
        }

        return $attributes;
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Models\AuthProvider;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Auth\OAuth\OAuthService;
use Pterodactyl\Services\Auth\OAuth\ProviderCatalog;

/**
 * Settings > Providers: the services people can sign in with (GitHub, Google, Discord, any OAuth 2 service).
 */
class ProvidersController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private OAuthService $oauth)
    {
    }

    public function index(): View
    {
        return view('admin.settings.providers', [
            'providers' => AuthProvider::query()->withCount('identities')->orderBy('id')->get(),
            'types' => ProviderCatalog::all(),
        ]);
    }

    public function create(Request $request): View|RedirectResponse
    {
        $type = (string) $request->query('type');
        if (!ProviderCatalog::has($type)) {
            return redirect()->route('admin.settings.providers');
        }

        $provider = new AuthProvider(['type' => $type, 'key' => $type === ProviderCatalog::GENERIC ? '' : $type, 'enabled' => true, 'allow_signup' => true]);

        return $this->form($provider, false);
    }

    public function store(Request $request): RedirectResponse
    {
        $type = (string) $request->input('type');
        abort_unless(ProviderCatalog::has($type), 404);

        $data = $request->validate($this->rules($type, null));
        $provider = AuthProvider::query()->create($this->attributes($request, $type, $data, null));

        $this->alert->success($provider->name . ' was added. Copy the callback address below into the service and switch it on.')->flash();

        return redirect()->route('admin.settings.providers.edit', $provider->id);
    }

    public function edit(AuthProvider $provider): View
    {
        return $this->form($provider, true);
    }

    public function update(Request $request, AuthProvider $provider): RedirectResponse
    {
        $data = $request->validate($this->rules($provider->type, $provider));
        $provider->forceFill($this->attributes($request, $provider->type, $data, $provider))->save();

        $this->alert->success($provider->name . ' was saved.')->flash();

        return redirect()->route('admin.settings.providers.edit', $provider->id);
    }

    public function destroy(AuthProvider $provider): RedirectResponse
    {
        $name = $provider->name;
        $provider->delete();

        $this->alert->success($name . ' was removed. Accounts linked to it can sign in with their password only.')->flash();

        return redirect()->route('admin.settings.providers');
    }

    private function form(AuthProvider $provider, bool $exists): View
    {
        $preset = ProviderCatalog::preset($provider->type);

        return view('admin.settings.provider', [
            'provider' => $provider,
            'exists' => $exists,
            'preset' => $preset,
            'endpoints' => ProviderCatalog::endpointsOf($provider),
            'callback' => $exists ? $this->oauth->callbackUrl($provider) : url('/auth/oauth/' . ($provider->key ?: '<key>') . '/callback'),
        ]);
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

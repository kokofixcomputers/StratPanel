<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Pterodactyl\Models\DnsZone;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Services\Dns\DnsException;
use Pterodactyl\Services\Dns\DnsProviders;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Domains\ManagedDomainService;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * The two ways people get a domain for a server, for the admin pages. They bring their own (an A record they add themselves), or they
 * take a name under a domain of the admin and the panel adds the record at the DNS provider of that domain.
 */
class DomainsController extends Controller
{
    public const DOMAIN_REGEX = '/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/';

    public function __construct(private SettingsRepositoryInterface $settings, private ManagedDomainService $managed)
    {
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'custom_enabled' => (bool) config('pterodactyl.domains.enabled'),
            'zones' => DnsZone::query()->withCount('domains')->orderBy('domain')->get()->map(fn (DnsZone $zone) => [
                'id' => $zone->id,
                'name' => $zone->name,
                'domain' => $zone->domain,
                'type' => $zone->type,
                'enabled' => (bool) $zone->enabled,
                'names' => (int) $zone->domains_count,
            ])->values()->all(),
            'types' => collect(DnsProviders::types())->map(fn (array $type, string $key) => ['type' => $key, 'name' => $type['name']])->values()->all(),
            'target_ip' => ServerDomain::routerTargetIp(),
        ]);
    }

    /** The switch for people bringing their own domain. */
    public function update(Request $request): JsonResponse
    {
        $this->settings->set('settings::pterodactyl:domains:enabled', $request->boolean('custom_enabled') ? 'true' : 'false');

        return $this->index();
    }

    /** What a form for a new domain of a type starts with. */
    public function blank(Request $request): JsonResponse
    {
        $type = (string) $request->query('type', 'cloudflare');
        abort_unless(isset(DnsProviders::types()[$type]), 404);

        return new JsonResponse($this->form(new DnsZone(['type' => $type, 'enabled' => true, 'ttl' => 120, 'credentials' => []]), false));
    }

    public function view(int $zone): JsonResponse
    {
        return new JsonResponse($this->form(DnsZone::query()->findOrFail($zone), true));
    }

    public function store(Request $request): JsonResponse
    {
        $type = (string) $request->input('type');
        abort_unless(isset(DnsProviders::types()[$type]), 404);

        $request->merge(['domain' => strtolower(rtrim(trim((string) $request->input('domain')), '.'))]);
        $data = $request->validate($this->rules($type, null));
        $zone = new DnsZone([
            'type' => $type,
            'name' => $data['name'],
            'domain' => $data['domain'],
            'ttl' => (int) $data['ttl'],
            'enabled' => $request->boolean('enabled'),
            'credentials' => $this->credentials($request, $type, []),
        ]);

        // Checked before it is kept: a domain that cannot be reached is never offered to people.
        $check = $this->check($zone);
        $zone->save();
        if (!$check['ok']) {
            $zone->update(['enabled' => false]);
        }

        return new JsonResponse([
            'ok' => $check['ok'],
            'message' => $check['ok']
                ? "{$zone->domain} was added: {$check['message']}"
                : "{$zone->domain} was saved, but {$check['message']} It is not offered to people until this works.",
        ] + $this->form($zone->refresh(), true), 201);
    }

    public function updateZone(Request $request, int $zone): JsonResponse
    {
        $found = DnsZone::query()->findOrFail($zone);
        $data = $request->validate($this->rules($found->type, $found));
        $found->fill([
            'name' => $data['name'],
            'ttl' => (int) $data['ttl'],
            'enabled' => $request->boolean('enabled'),
            'credentials' => $this->credentials($request, $found->type, $found->credentials ?? []),
        ]);

        $check = $this->check($found);
        if (!$check['ok'] && $found->enabled) {
            $found->enabled = false;
            $message = "It was saved, but {$check['message']} It is switched off until this works.";
        } else {
            $message = 'Saved. ' . ($check['ok'] ? ucfirst($check['message']) : '');
        }
        $found->save();

        return new JsonResponse(['ok' => $check['ok'], 'message' => trim($message)] + $this->form($found->refresh(), true));
    }

    /** Looks again whether the credentials work. */
    public function test(int $zone): JsonResponse
    {
        $found = DnsZone::query()->findOrFail($zone);
        $check = $this->check($found);
        $found->save();

        return new JsonResponse([
            'ok' => $check['ok'],
            'message' => $check['ok'] ? ucfirst($check['message']) : 'It does not work: ' . $check['message'],
        ]);
    }

    /** Removes the domain and every name under it (and their DNS records). */
    public function destroy(int $zone): JsonResponse
    {
        $found = DnsZone::query()->findOrFail($zone);
        $found->domains()->with('zone')->get()->each(fn (ServerDomain $domain) => $this->managed->remove($domain));
        $found->delete();

        return new JsonResponse([], 204);
    }

    /**
     * Asks the provider whether the credentials work and keeps what it found out (the zone id). The zone is not saved here.
     *
     * @return array{ok: bool, message: string}
     */
    private function check(DnsZone $zone): array
    {
        try {
            $result = DnsProviders::make($zone)->verify($zone);
        } catch (DnsException $e) {
            return ['ok' => false, 'message' => rtrim($e->getMessage(), '.') . '.'];
        }
        if (!empty($result['credentials'])) {
            $zone->credentials = array_merge($zone->credentials ?? [], $result['credentials']);
        }

        return ['ok' => $result['ok'], 'message' => rtrim($result['message'], '.') . '.'];
    }

    /** @return array<string, mixed> */
    private function form(DnsZone $zone, bool $exists): array
    {
        $type = DnsProviders::types()[$zone->type];
        $credentials = $zone->credentials ?? [];

        return [
            'id' => $exists ? $zone->id : null,
            'type' => $zone->type,
            'provider' => $type['name'],
            'help' => $type['help'] ?? null,
            'name' => (string) $zone->name,
            'domain' => (string) $zone->domain,
            'ttl' => (int) ($zone->ttl ?? 120),
            'enabled' => (bool) $zone->enabled,
            'names' => $exists ? $zone->domains()->count() : 0,
            // A secret is never sent back, only whether one is saved.
            'fields' => collect($type['fields'])->map(fn (array $field, string $key) => [
                'key' => $key,
                'label' => $field['label'],
                'secret' => (bool) $field['secret'],
                'required' => (bool) $field['required'],
                'help' => $field['help'] ?? null,
                'value' => $field['secret'] ? '' : (string) ($credentials[$key] ?? ''),
                'saved' => $field['secret'] ? ((string) ($credentials[$key] ?? '')) !== '' : null,
            ])->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function rules(string $type, ?DnsZone $zone): array
    {
        $rules = [
            'name' => ['required', 'string', 'max:60'],
            'ttl' => ['required', 'integer', 'between:60,86400'],
        ];
        if (!$zone) {
            $rules['domain'] = ['required', 'string', 'max:200', 'regex:' . self::DOMAIN_REGEX, Rule::unique('dns_zones', 'domain')];
        }
        foreach (DnsProviders::types()[$type]['fields'] as $key => $field) {
            // A secret that is left empty stays as it is.
            $rules["credentials.$key"] = [($field['required'] && !$zone) ? 'required' : 'nullable', 'string', 'max:500'];
        }

        return $rules;
    }

    /**
     * @param  array<string, string>  $existing
     * @return array<string, string>
     */
    private function credentials(Request $request, string $type, array $existing): array
    {
        $out = $existing;
        foreach (DnsProviders::types()[$type]['fields'] as $key => $field) {
            $value = trim((string) $request->input("credentials.$key", ''));
            if ($value !== '') {
                $out[$key] = $value;
            } elseif (!$field['secret']) {
                // A field that is shown (not a secret) and emptied is emptied.
                unset($out[$key]);
            }
        }

        return $out;
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Pterodactyl\Models\DnsZone;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Services\Dns\DnsException;
use Pterodactyl\Services\Dns\DnsProviders;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Domains\ManagedDomainService;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * Settings > Domains: the two ways people get a domain for a server. They bring their own (an A record they add themselves), or they
 * take a name under a domain of the admin and the panel adds the record at the DNS provider of that domain.
 */
class DomainsController extends Controller
{
    public const DOMAIN_REGEX = '/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/';

    public function __construct(
        private AlertsMessageBag $alert,
        private SettingsRepositoryInterface $settings,
        private ManagedDomainService $managed,
    ) {
    }

    public function index(): View
    {
        return view('admin.settings.domains', [
            'customEnabled' => (bool) config('pterodactyl.domains.enabled'),
            'zones' => DnsZone::query()->withCount('domains')->orderBy('domain')->get(),
            'types' => DnsProviders::types(),
            'targetIp' => ServerDomain::routerTargetIp(),
        ]);
    }

    /** The switch for people bringing their own domain. */
    public function update(Request $request): RedirectResponse
    {
        $this->settings->set('settings::pterodactyl:domains:enabled', $request->boolean('custom_enabled') ? 'true' : 'false');
        $this->alert->success('Domain settings were saved.')->flash();

        return redirect()->route('admin.settings.domains');
    }

    public function create(Request $request): View|RedirectResponse
    {
        $type = (string) $request->query('type', 'cloudflare');
        if (!isset(DnsProviders::types()[$type])) {
            return redirect()->route('admin.settings.domains');
        }

        return $this->form(new DnsZone(['type' => $type, 'enabled' => true, 'ttl' => 120, 'credentials' => []]), false);
    }

    public function store(Request $request): RedirectResponse
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

        $check['ok']
            ? $this->alert->success("{$zone->domain} was added: {$check['message']}")->flash()
            : $this->alert->warning("{$zone->domain} was saved, but {$check['message']} It is not offered to people until this works.")->flash();
        if (!$check['ok']) {
            $zone->update(['enabled' => false]);
        }

        return redirect()->route('admin.settings.domains.edit', $zone->id);
    }

    public function edit(DnsZone $zone): View
    {
        return $this->form($zone, true);
    }

    public function updateZone(Request $request, DnsZone $zone): RedirectResponse
    {
        $data = $request->validate($this->rules($zone->type, $zone));
        $zone->fill([
            'name' => $data['name'],
            'ttl' => (int) $data['ttl'],
            'enabled' => $request->boolean('enabled'),
            'credentials' => $this->credentials($request, $zone->type, $zone->credentials ?? []),
        ]);

        $check = $this->check($zone);
        if (!$check['ok'] && $zone->enabled) {
            $zone->enabled = false;
            $this->alert->warning("It was saved, but {$check['message']} It is switched off until this works.")->flash();
        } else {
            $this->alert->success('Saved. ' . ($check['ok'] ? ucfirst($check['message']) : ''))->flash();
        }
        $zone->save();

        return redirect()->route('admin.settings.domains.edit', $zone->id);
    }

    /** Looks again whether the credentials work. */
    public function test(DnsZone $zone): RedirectResponse
    {
        $check = $this->check($zone);
        $zone->save();
        $check['ok']
            ? $this->alert->success(ucfirst($check['message']))->flash()
            : $this->alert->danger('It does not work: ' . $check['message'])->flash();

        return redirect()->route('admin.settings.domains.edit', $zone->id);
    }

    /** Removes the domain and every name under it (and their DNS records). */
    public function destroy(DnsZone $zone): RedirectResponse
    {
        $zone->domains()->with('zone')->get()->each(fn (ServerDomain $domain) => $this->managed->remove($domain));
        $zone->delete();
        $this->alert->success("{$zone->domain} was removed.")->flash();

        return redirect()->route('admin.settings.domains');
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

    private function form(DnsZone $zone, bool $exists): View
    {
        $type = DnsProviders::types()[$zone->type];

        return view('admin.settings.domain-zone', [
            'zone' => $zone,
            'exists' => $exists,
            'type' => $type,
            'credentials' => $zone->credentials ?? [],
            'count' => $exists ? $zone->domains()->count() : 0,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
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
     * @param array<string, string> $existing
     *
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

<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Services\Acme\DomainCertificateService;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Certificates\CertificateException;
use Pterodactyl\Services\Certificates\CertificateService;
use Pterodactyl\Services\Nodes\NodeCertificateService;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/** The certificates the panel is served with over https (by the edge, see tools/stratnet/edge), for the admin pages. */
class CertificatesController extends Controller
{
    public function __construct(
        private CertificateService $certificates,
        private NodeCertificateService $nodes,
        private SettingsRepositoryInterface $settings,
        private DomainCertificateService $acme,
    ) {
    }

    /** Nodes that use a certificate get the renewed one at once, a node that can not be reached gets it with the next hourly run. */
    private function syncNodes(): void
    {
        try {
            $this->nodes->syncAll();
        } catch (\Throwable) {
            // The hourly run tries again.
        }
    }

    public function index(): JsonResponse
    {
        $edge = $this->certificates->lastEdge();

        return new JsonResponse([
            'certificates' => Certificate::query()->orderByDesc('is_default')->orderBy('name')->get()->map(fn (Certificate $certificate) => $this->summary($certificate))->values()->all(),
            'token_configured' => $this->certificates->tokenConfigured(),
            'edge' => $edge === null ? null : [
                'at' => $edge['at']->toIso8601String(),
                'recent' => $edge['at']->gt(now()->subMinutes(5)),
                'ip' => $edge['ip'],
                'count' => $edge['count'],
                'http' => in_array('http', $edge['features'] ?? [], true),
            ],
            'acme' => [
                'enabled' => (bool) config('acme.enabled'),
                'email' => (string) config('acme.email'),
                'staging' => (bool) config('acme.staging'),
            ],
            // The domains that were added to servers, and what they have: a certificate can be asked for from here.
            'domains' => ServerDomain::query()->with('server:id,name')->orderBy('domain')->get()->map(function (ServerDomain $domain) {
                $state = $this->acme->describe($domain);

                return [
                    'id' => $domain->id,
                    'domain' => $domain->domain,
                    'server' => $domain->server?->name,
                    'status' => $state['status'],
                    'message' => $state['message'],
                    'covered_by' => $state['covered_by'],
                    'expires_at' => $state['expires_at'],
                    'can_request' => $state['can_request'],
                    'can_request_dns' => $state['can_request_dns'],
                    'reason' => $state['reason'],
                    'dns' => $state['dns'],
                ];
            })->values()->all(),
        ]);
    }

    /** Turns the free certificates from Let's Encrypt on or off, and sets what it needs. */
    public function acme(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => 'nullable|email|max:191', 'agree' => 'nullable|boolean']);
        $enable = $request->boolean('enabled');

        if ($enable && !$request->boolean('agree') && !config('acme.enabled')) {
            throw new DisplayException('Agree to the Let\'s Encrypt Subscriber Agreement to turn this on.');
        }

        $this->settings->set('settings::acme:enabled', $enable ? 'true' : 'false');
        $this->settings->set('settings::acme:email', (string) ($data['email'] ?? ''));
        $this->settings->set('settings::acme:staging', $request->boolean('staging') ? 'true' : 'false');

        return $this->index();
    }

    /** Starts getting a certificate from Let's Encrypt for a domain that was added to a server. It runs in the background, the list shows how it goes. */
    public function issue(Request $request): JsonResponse
    {
        $data = $request->validate(['domain_id' => 'required|integer|exists:server_domains,id', 'method' => 'required|in:http,dns']);
        $domain = ServerDomain::query()->findOrFail($data['domain_id']);

        $data['method'] === 'dns' ? $this->acme->requestDns($domain) : $this->acme->request($domain);

        return $this->index();
    }

    /** Gets a new certificate for one from Let's Encrypt now, the same way it was got the first time. */
    public function renew(int $certificate): JsonResponse
    {
        $this->acme->renewNow(Certificate::query()->findOrFail($certificate));

        return $this->index();
    }

    public function view(int $certificate): JsonResponse
    {
        return new JsonResponse($this->detail(Certificate::query()->findOrFail($certificate)));
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate($this->rules());

        try {
            $certificate = $this->certificates->create(
                (string) $request->input('name'),
                $this->text($request, 'certificate'),
                $this->text($request, 'private_key'),
                $request->input('passphrase')
            );
        } catch (CertificateException $exception) {
            throw new DisplayException($exception->getMessage());
        }

        $this->syncNodes();

        return new JsonResponse([
            'message' => $certificate->name . ' was added. It covers ' . implode(', ', $certificate->domains) . '.',
            'warning' => $this->certificates->lacksIntermediates($certificate)
                ? 'It came without the intermediate certificates of the authority (use fullchain.pem, not cert.pem). Browsers usually cope, apps and other clients often do not. Use Renew on its page to add the full chain.'
                : null,
        ] + $this->detail($certificate), 201);
    }

    public function update(Request $request, int $certificate): JsonResponse
    {
        $found = Certificate::query()->findOrFail($certificate);
        $request->validate($this->rules());

        try {
            // A new certificate and key are only used when both were given.
            $hasNew = $this->text($request, 'certificate', false) !== '' || $this->text($request, 'private_key', false) !== '';
            if ($hasNew) {
                $this->certificates->replace($found, $this->text($request, 'certificate'), $this->text($request, 'private_key'), $request->input('passphrase'));
            }
        } catch (CertificateException $exception) {
            throw new DisplayException($exception->getMessage());
        }

        $this->certificates->update($found->refresh(), (string) $request->input('name'), $request->boolean('enabled'), $request->boolean('is_default'));
        $this->syncNodes();

        return new JsonResponse($this->detail($found->refresh()));
    }

    public function destroy(int $certificate): JsonResponse
    {
        $this->certificates->delete(Certificate::query()->findOrFail($certificate));

        return new JsonResponse([], 204);
    }

    /** @return array<string, mixed> */
    private function summary(Certificate $certificate): array
    {
        return [
            'id' => $certificate->id,
            'name' => $certificate->name,
            'domains' => $certificate->domains,
            'is_default' => (bool) $certificate->is_default,
            'enabled' => (bool) $certificate->enabled,
            'source' => $certificate->source,
            'acme_method' => $certificate->acme_method,
            'renew_error' => $certificate->renew_error,
            'no_chain' => $this->certificates->lacksIntermediates($certificate),
            'expired' => $certificate->isExpired(),
            'expiring' => $certificate->isExpiring(),
            'days_left' => $certificate->daysLeft(),
            'not_after' => $certificate->not_after?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function detail(Certificate $certificate): array
    {
        return $this->summary($certificate) + [
            'issuer' => $certificate->issuer,
            'not_before' => $certificate->not_before?->toIso8601String(),
            'fingerprint' => $certificate->fingerprint,
        ];
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'certificate' => 'nullable|string|max:100000',
            'private_key' => 'nullable|string|max:20000',
            'passphrase' => 'nullable|string|max:500',
            'enabled' => 'nullable|boolean',
            'is_default' => 'nullable|boolean',
        ];
    }

    /** @throws CertificateException */
    private function text(Request $request, string $field, bool $required = true): string
    {
        $text = trim((string) $request->input($field, ''));

        if ($text === '' && $required) {
            throw new CertificateException($field === 'certificate' ? 'Add the certificate (paste it or choose its file).' : 'Add the private key (paste it or choose its file).');
        }

        return $text;
    }
}

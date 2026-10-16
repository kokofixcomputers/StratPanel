<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Certificates\CertificateException;
use Pterodactyl\Services\Certificates\CertificateService;
use Pterodactyl\Services\Nodes\NodeCertificateService;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * Settings > Certificates: the certificates the panel is served with over https (by panel-edge, see tools/panel-edge).
 */
class CertificatesController extends Controller
{
    public function __construct(
        private AlertsMessageBag $alert,
        private CertificateService $certificates,
        private NodeCertificateService $nodes,
        private SettingsRepositoryInterface $settings,
    )
    {
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

    public function index(): View
    {
        return view('admin.settings.certificates', [
            'certificates' => Certificate::query()->orderByDesc('is_default')->orderBy('name')->get(),
            'tokenConfigured' => $this->certificates->tokenConfigured(),
            'edge' => $this->certificates->lastEdge(),
        ]);
    }

    /** Turns the free certificates from Let's Encrypt on or off, and sets what it needs. */
    public function acme(Request $request): RedirectResponse
    {
        $data = $request->validate(['email' => 'nullable|email|max:191', 'agree' => 'nullable|boolean']);
        $enable = $request->boolean('enabled');

        if ($enable && !$request->boolean('agree') && !config('acme.enabled')) {
            $this->alert->danger('Agree to the Let\'s Encrypt Subscriber Agreement to turn this on.')->flash();

            return redirect()->route('admin.settings.certificates');
        }

        $this->settings->set('settings::acme:enabled', $enable ? 'true' : 'false');
        $this->settings->set('settings::acme:email', (string) ($data['email'] ?? ''));
        $this->settings->set('settings::acme:staging', $request->boolean('staging') ? 'true' : 'false');
        $this->alert->success('The Let\'s Encrypt settings were saved.')->flash();

        return redirect()->route('admin.settings.certificates');
    }

    public function edit(Certificate $certificate): View
    {
        return view('admin.settings.certificate', ['certificate' => $certificate]);
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate($this->rules(true));

        try {
            $certificate = $this->certificates->create(
                (string) $request->input('name'),
                $this->text($request, 'certificate'),
                $this->text($request, 'private_key'),
                $request->input('passphrase')
            );
        } catch (CertificateException $exception) {
            $this->alert->danger($exception->getMessage())->flash();

            return redirect()->route('admin.settings.certificates')->withInput($request->except(['private_key', 'private_key_file', 'passphrase']));
        }

        $this->syncNodes();
        $this->alert->success($certificate->name . ' was added. It covers ' . implode(', ', $certificate->domains) . '.')->flash();
        if ($this->certificates->lacksIntermediates($certificate)) {
            $this->alert->warning('It came without the intermediate certificates of the authority (use fullchain.pem, not cert.pem). Browsers usually cope, apps and other clients often do not. Use Renew on its page to add the full chain.')->flash();
        }

        return redirect()->route('admin.settings.certificates');
    }

    public function update(Request $request, Certificate $certificate): RedirectResponse
    {
        $request->validate($this->rules(false));

        try {
            // A new certificate and key are only used when both were given.
            $hasNew = $this->text($request, 'certificate', false) !== '' || $this->text($request, 'private_key', false) !== '';
            if ($hasNew) {
                $this->certificates->replace(
                    $certificate,
                    $this->text($request, 'certificate'),
                    $this->text($request, 'private_key'),
                    $request->input('passphrase')
                );
            }
        } catch (CertificateException $exception) {
            $this->alert->danger($exception->getMessage())->flash();

            return redirect()->route('admin.settings.certificates.edit', $certificate->id);
        }

        $this->certificates->update($certificate->refresh(), (string) $request->input('name'), $request->boolean('enabled'), $request->boolean('is_default'));
        $this->syncNodes();
        $this->alert->success($certificate->name . ' was saved.')->flash();

        return redirect()->route('admin.settings.certificates.edit', $certificate->id);
    }

    public function destroy(Certificate $certificate): RedirectResponse
    {
        $name = $certificate->name;
        $this->certificates->delete($certificate);
        $this->alert->success($name . ' was deleted. It is no longer used within a minute.')->flash();

        return redirect()->route('admin.settings.certificates');
    }

    /** @return array<string, mixed> */
    private function rules(bool $creating): array
    {
        return [
            'name' => 'required|string|max:100',
            'certificate' => 'nullable|string|max:100000',
            'certificate_file' => 'nullable|file|max:200',
            'private_key' => 'nullable|string|max:20000',
            'private_key_file' => 'nullable|file|max:50',
            'passphrase' => 'nullable|string|max:500',
            'enabled' => 'nullable|boolean',
            'is_default' => 'nullable|boolean',
        ];
    }

    /**
     * The text of a field: what was pasted, or the content of the file that was chosen.
     *
     * @throws CertificateException
     */
    private function text(Request $request, string $field, bool $required = true): string
    {
        $file = $request->file($field . '_file');
        $text = $file !== null ? (string) file_get_contents($file->getRealPath()) : (string) $request->input($field, '');
        $text = trim($text);

        if ($text === '' && $required) {
            throw new CertificateException($field === 'certificate' ? 'Add the certificate (paste it or choose its file).' : 'Add the private key (paste it or choose its file).');
        }

        return $text;
    }
}

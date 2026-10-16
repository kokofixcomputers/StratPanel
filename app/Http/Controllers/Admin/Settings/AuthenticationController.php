<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Models\AuthProvider;
use Pterodactyl\Http\Controllers\Controller;
use Illuminate\Contracts\Encryption\Encrypter;
use Pterodactyl\Services\Auth\Captcha\CaptchaService;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * Settings > Authentication: the captcha on the forms, and whether people can sign up on their own. The services people can
 * sign in with are on the next page (ProvidersController).
 */
class AuthenticationController extends Controller
{
    public function __construct(
        private AlertsMessageBag $alert,
        private SettingsRepositoryInterface $settings,
        private Encrypter $encrypter,
        private CaptchaService $captcha,
    ) {
    }

    public function index(): View
    {
        return view('admin.settings.authentication', [
            'provider' => $this->captcha->provider(),
            'recaptchaShipped' => config('recaptcha._shipped_secret_key') === config('recaptcha.secret_key')
                || config('recaptcha._shipped_website_key') === config('recaptcha.website_key'),
            'hasTurnstileSecret' => (string) config('auth.captcha.turnstile.secret_key') !== '',
            'providers' => AuthProvider::query()->count(),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'captcha' => ['required', Rule::in(CaptchaService::PROVIDERS)],
            'recaptcha_site_key' => 'nullable|string|max:191',
            'recaptcha_secret_key' => 'nullable|string|max:191',
            'turnstile_site_key' => 'nullable|string|max:191',
            'turnstile_secret_key' => 'nullable|string|max:191',
            'passkeys' => 'nullable|boolean',
            'registration' => 'nullable|boolean',
            'registration_password' => 'nullable|boolean',
        ]);

        $recaptchaSite = trim((string) ($data['recaptcha_site_key'] ?? '')) ?: config('recaptcha.website_key');
        $recaptchaSecret = trim((string) ($data['recaptcha_secret_key'] ?? '')) ?: config('recaptcha.secret_key');
        $turnstileSite = trim((string) ($data['turnstile_site_key'] ?? '')) ?: config('auth.captcha.turnstile.site_key');
        $turnstileSecret = trim((string) ($data['turnstile_secret_key'] ?? '')) ?: config('auth.captcha.turnstile.secret_key');

        // A captcha without its keys would lock everybody out of the forms it protects.
        if ($data['captcha'] === CaptchaService::RECAPTCHA && (!$recaptchaSite || !$recaptchaSecret)) {
            return $this->back('Enter the site key and the secret key of reCAPTCHA, or pick another captcha.', 'danger');
        }
        if ($data['captcha'] === CaptchaService::TURNSTILE && (!$turnstileSite || !$turnstileSecret)) {
            return $this->back('Enter the site key and the secret key of Turnstile, or pick another captcha.', 'danger');
        }

        $this->put('auth:captcha:provider', $data['captcha']);
        // The old switch stays in step, it is what panels from before this page look at.
        $this->put('recaptcha:enabled', $data['captcha'] === CaptchaService::RECAPTCHA ? 'true' : 'false');
        $this->put('recaptcha:website_key', $recaptchaSite);
        $this->put('recaptcha:secret_key', $recaptchaSecret);
        $this->put('auth:captcha:turnstile:site_key', $turnstileSite ?? '');
        $this->put('auth:captcha:turnstile:secret_key', $this->encrypter->encrypt($turnstileSecret ?? ''));
        $this->put('auth:passkeys:enabled', $request->boolean('passkeys') ? 'true' : 'false');
        $this->put('auth:registration:enabled', $request->boolean('registration') ? 'true' : 'false');
        $this->put('auth:registration:password', $request->boolean('registration_password') ? 'true' : 'false');

        return $this->back('Authentication settings were saved.');
    }

    private function put(string $key, mixed $value): void
    {
        $this->settings->set('settings::' . $key, $value);
    }

    private function back(string $message, string $type = 'success'): RedirectResponse
    {
        $this->alert->{$type}($message)->flash();

        return redirect()->route('admin.settings.authentication');
    }
}

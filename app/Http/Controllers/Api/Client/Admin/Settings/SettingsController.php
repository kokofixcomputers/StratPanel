<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Pterodactyl\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Pterodactyl\Models\AuthProvider;
use Pterodactyl\Models\ServerTrashItem;
use Illuminate\Contracts\Console\Kernel;
use Pterodactyl\Notifications\MailTested;
use Pterodactyl\Services\Pools\ResourcePool;
use Illuminate\Support\Facades\Notification;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Illuminate\Contracts\Encryption\Encrypter;
use Pterodactyl\Providers\SettingsServiceProvider;
use Pterodactyl\Traits\Helpers\AvailableLanguages;
use Pterodactyl\Services\Branding\BrandingService;
use Pterodactyl\Services\CurseForge\CurseForgeService;
use Pterodactyl\Services\Auth\Captcha\CaptchaService;
use Pterodactyl\Http\Requests\Admin\Settings\BrandingFormRequest;
use Pterodactyl\Http\Requests\Admin\Settings\BaseSettingsFormRequest;
use Pterodactyl\Http\Requests\Admin\Settings\MailSettingsFormRequest;
use Pterodactyl\Http\Requests\Admin\Settings\CurseForgeFormRequest;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;
use Pterodactyl\Http\Requests\Admin\Settings\AdvancedSettingsFormRequest;

/**
 * The pages of Settings that are one form each, for the admin pages. A page has a "show" that gives what is set now and an "update" that
 * takes the form and gives what is set after it, so the page always shows what was really saved. The pages with a list (providers,
 * domains, certificates) have their own controller.
 */
class SettingsController extends Controller
{
    use AvailableLanguages;

    public function __construct(
        private SettingsRepositoryInterface $settings,
        private Kernel $kernel,
        private Encrypter $encrypter,
        private BrandingService $branding,
        private CurseForgeService $curseForge,
        private CaptchaService $captcha,
        private ResourcePool $pools,
    ) {
    }

    private function put(string $key, mixed $value): void
    {
        $this->settings->set('settings::' . $key, $value);
    }

    private function flag(Request $request, string $key): string
    {
        return $request->boolean($key) ? 'true' : 'false';
    }

    // ---- general ---------------------------------------------------------------------------------------------------------

    /** @param  array<string, mixed>  $saved  what was just saved, the settings are read into the config only when the next request starts */
    public function general(array $saved = []): JsonResponse
    {
        return new JsonResponse($saved + [
            'name' => (string) config('app.name'),
            'two_factor' => (int) config('pterodactyl.auth.2fa_required'),
            'locale' => (string) config('app.locale'),
            'languages' => $this->getAvailableLanguages(true),
        ]);
    }

    public function updateGeneral(BaseSettingsFormRequest $request): JsonResponse
    {
        foreach ($request->normalize() as $key => $value) {
            $this->put($key, $value);
        }
        $this->kernel->call('queue:restart');

        return $this->general([
            'name' => (string) $request->input('app:name'),
            'two_factor' => (int) $request->input('pterodactyl:auth:2fa_required'),
            'locale' => (string) $request->input('app:locale'),
        ]);
    }

    // ---- advanced --------------------------------------------------------------------------------------------------------

    /** @param  array<string, mixed>  $saved  see general() */
    public function advanced(array $saved = []): JsonResponse
    {
        return new JsonResponse($saved + [
            'timeout' => (int) config('pterodactyl.guzzle.timeout'),
            'connect_timeout' => (int) config('pterodactyl.guzzle.connect_timeout'),
        ]);
    }

    public function updateAdvanced(AdvancedSettingsFormRequest $request): JsonResponse
    {
        foreach ($request->normalize() as $key => $value) {
            $this->put($key, $value);
        }
        $this->kernel->call('queue:restart');

        return $this->advanced([
            'timeout' => (int) $request->input('pterodactyl:guzzle:timeout'),
            'connect_timeout' => (int) $request->input('pterodactyl:guzzle:connect_timeout'),
        ]);
    }

    // ---- mail ------------------------------------------------------------------------------------------------------------

    /** @param  array<string, mixed>  $saved  see general() */
    public function mail(array $saved = []): JsonResponse
    {
        return new JsonResponse($saved + [
            // The form is only for SMTP, any other driver is set in .env.
            'disabled' => config('mail.default') !== 'smtp',
            'host' => (string) config('mail.mailers.smtp.host'),
            'port' => (int) config('mail.mailers.smtp.port'),
            'encryption' => (string) (config('mail.mailers.smtp.encryption') ?? ''),
            'username' => (string) config('mail.mailers.smtp.username'),
            'password_saved' => (string) config('mail.mailers.smtp.password') !== '',
            'from_address' => (string) config('mail.from.address'),
            'from_name' => (string) config('mail.from.name'),
        ]);
    }

    /** @throws DisplayException */
    public function updateMail(MailSettingsFormRequest $request): JsonResponse
    {
        if (config('mail.default') !== 'smtp') {
            throw new DisplayException('This feature is only available if SMTP is the selected email driver for the Panel.');
        }

        $values = $request->normalize();
        if (($values['mail:mailers:smtp:password'] ?? null) === '!e') {
            $values['mail:mailers:smtp:password'] = '';
        }
        foreach ($values as $key => $value) {
            if (in_array($key, SettingsServiceProvider::getEncryptedKeys()) && !empty($value)) {
                $value = $this->encrypter->encrypt($value);
            }
            $this->put($key, $value);
        }
        $this->kernel->call('queue:restart');

        return $this->mail([
            'host' => (string) $request->input('mail:mailers:smtp:host'),
            'port' => (int) $request->input('mail:mailers:smtp:port'),
            'encryption' => (string) ($request->input('mail:mailers:smtp:encryption') ?? ''),
            'username' => (string) $request->input('mail:mailers:smtp:username'),
            'password_saved' => array_key_exists('mail:mailers:smtp:password', $values)
                ? $values['mail:mailers:smtp:password'] !== ''
                : (string) config('mail.mailers.smtp.password') !== '',
            'from_address' => (string) $request->input('mail:from:address'),
            'from_name' => (string) $request->input('mail:from:name'),
        ]);
    }

    /** Sends a test message to the person who asks. */
    public function testMail(Request $request): JsonResponse
    {
        try {
            Notification::route('mail', $request->user()->email)->notify(new MailTested($request->user()));
        } catch (\Exception $exception) {
            throw new DisplayException($exception->getMessage());
        }

        return new JsonResponse(['sent_to' => $request->user()->email]);
    }

    // ---- trash -----------------------------------------------------------------------------------------------------------

    /** @param  array<string, mixed>  $saved  what was just saved, the settings are read into the config only when the next request starts */
    public function trash(array $saved = []): JsonResponse
    {
        return new JsonResponse($saved + [
            'enabled' => (bool) config('trash.enabled'),
            'retention_days' => (int) config('trash.retention_days', 30),
        ] + [
            'items' => ServerTrashItem::query()->count(),
            'bytes' => (int) ServerTrashItem::query()->sum('size'),
        ]);
    }

    public function updateTrash(Request $request): JsonResponse
    {
        $data = $request->validate(['retention_days' => 'required|integer|between:1,365']);

        $this->put('trash:enabled', $this->flag($request, 'enabled'));
        $this->put('trash:retention_days', (string) $data['retention_days']);

        return $this->trash(['enabled' => $request->boolean('enabled'), 'retention_days' => (int) $data['retention_days']]);
    }

    // ---- pools -----------------------------------------------------------------------------------------------------------

    /** @param  array<string, mixed>  $saved  what was just saved, see trash() */
    public function pools(array $saved = []): JsonResponse
    {
        return new JsonResponse($saved + [
            'enabled' => $this->pools->enabled(),
            'defaults' => $this->pools->defaults(),
        ] + [
            'own' => User::query()->where(function ($query) {
                foreach (ResourcePool::RESOURCES as $resource) {
                    $query->orWhereNotNull('pool_' . $resource);
                }
            })->count(),
        ]);
    }

    public function updatePools(Request $request): JsonResponse
    {
        $data = $request->validate([
            'memory' => 'required|integer|between:0,100000000',
            'disk' => 'required|integer|between:0,100000000',
            'cpu' => 'required|integer|between:0,100000',
            'allocations' => 'required|integer|between:0,1000',
            'backups' => 'required|integer|between:0,10000',
            'databases' => 'required|integer|between:0,1000',
        ]);

        $this->put('pterodactyl:pools:enabled', $this->flag($request, 'enabled'));
        foreach ($data as $key => $value) {
            $this->put('pterodactyl:pools:' . $key, (string) $value);
        }

        return $this->pools(['enabled' => $request->boolean('enabled'), 'defaults' => array_map('intval', $data)]);
    }

    // ---- curseforge ------------------------------------------------------------------------------------------------------

    public function curseforge(): JsonResponse
    {
        return new JsonResponse([
            'enabled' => $this->curseForge->enabled(),
            'from_environment' => $this->curseForge->fromEnvironment(),
        ]);
    }

    public function updateCurseforge(CurseForgeFormRequest $request): JsonResponse
    {
        if ($request->boolean('remove_key')) {
            $this->curseForge->clearKey();

            return new JsonResponse(['message' => 'The CurseForge API key was removed. People can no longer browse CurseForge from the panel.', 'ok' => true] + $this->curseforge()->getData(true));
        }

        $this->curseForge->setKey($request->input('api_key'));
        $check = $this->curseForge->verify();

        return new JsonResponse([
            'ok' => $check['ok'],
            'message' => $check['ok'] ? 'The key was saved. ' . $check['message'] : 'The key was saved, but ' . $check['message'],
        ] + $this->curseforge()->getData(true));
    }

    /** Asks CurseForge whether the key that is in use is accepted. */
    public function testCurseforge(): JsonResponse
    {
        $check = $this->curseForge->enabled() ? $this->curseForge->verify() : ['ok' => false, 'message' => 'there is no key to test.'];

        return new JsonResponse([
            'ok' => $check['ok'],
            'message' => $check['ok'] ? $check['message'] : 'The key does not work: ' . $check['message'],
        ]);
    }

    // ---- authentication --------------------------------------------------------------------------------------------------

    public function authentication(): JsonResponse
    {
        return new JsonResponse([
            'captcha' => $this->captcha->provider(),
            'recaptcha_site_key' => (string) config('recaptcha.website_key'),
            'recaptcha_shipped' => config('recaptcha._shipped_secret_key') === config('recaptcha.secret_key')
                || config('recaptcha._shipped_website_key') === config('recaptcha.website_key'),
            'turnstile_site_key' => (string) config('auth.captcha.turnstile.site_key'),
            'turnstile_secret_saved' => (string) config('auth.captcha.turnstile.secret_key') !== '',
            'passkeys' => (bool) config('auth.passkeys.enabled'),
            'registration' => (bool) config('auth.registration.enabled'),
            'registration_password' => (bool) config('auth.registration.password'),
            'providers' => AuthProvider::query()->count(),
        ]);
    }

    /** @throws DisplayException */
    public function updateAuthentication(Request $request): JsonResponse
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
            throw new DisplayException('Enter the site key and the secret key of reCAPTCHA, or pick another captcha.');
        }
        if ($data['captcha'] === CaptchaService::TURNSTILE && (!$turnstileSite || !$turnstileSecret)) {
            throw new DisplayException('Enter the site key and the secret key of Turnstile, or pick another captcha.');
        }

        $this->put('auth:captcha:provider', $data['captcha']);
        // The old switch stays in step, it is what panels from before this page look at.
        $this->put('recaptcha:enabled', $data['captcha'] === CaptchaService::RECAPTCHA ? 'true' : 'false');
        $this->put('recaptcha:website_key', $recaptchaSite);
        $this->put('recaptcha:secret_key', $recaptchaSecret);
        $this->put('auth:captcha:turnstile:site_key', $turnstileSite ?? '');
        $this->put('auth:captcha:turnstile:secret_key', $this->encrypter->encrypt($turnstileSecret ?? ''));
        $this->put('auth:passkeys:enabled', $this->flag($request, 'passkeys'));
        $this->put('auth:registration:enabled', $this->flag($request, 'registration'));
        $this->put('auth:registration:password', $this->flag($request, 'registration_password'));

        return new JsonResponse(['saved' => true]);
    }

    // ---- branding --------------------------------------------------------------------------------------------------------

    public function branding(): JsonResponse
    {
        return new JsonResponse([
            'favicon' => $this->branding->favicon(),
            'console_prompt' => $this->branding->consolePrompt(),
            'announcements' => array_map(fn (array $item) => collect($item)->only(['id', 'title', 'message', 'type', 'enabled', 'dismissible', 'link_label', 'link_url'])->all(), $this->branding->announcements()),
            'links' => $this->branding->links(),
            'locations' => BrandingService::LOCATIONS,
            'types' => BrandingService::TYPES,
        ]);
    }

    /** Everything on the page at once. The lists are sent whole, so a row that is missing was deleted. The favicon is a file, so this is a POST. */
    public function updateBranding(BrandingFormRequest $request): JsonResponse
    {
        if ($request->hasFile('favicon')) {
            $this->branding->setFavicon($request->file('favicon'));
        } elseif ($request->boolean('remove_favicon')) {
            $this->branding->removeFavicon();
        }

        $this->branding->setConsolePrompt($request->input('console_prompt'));
        $this->branding->saveAnnouncements($request->input('announcements', []));
        $this->branding->saveLinks($request->input('links', []));

        return $this->branding();
    }
}

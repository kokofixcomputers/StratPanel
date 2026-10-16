<?php

namespace Pterodactyl\Services\Auth\Captcha;

use Illuminate\Http\Request;
use Illuminate\Http\Client\Factory as HttpFactory;

/**
 * The check that a person, not a script, is using the sign in, sign up and password reset forms. Google reCAPTCHA (the invisible
 * kind), Cloudflare Turnstile, or nothing. Which one is set by an admin under Settings > Authentication.
 */
class CaptchaService
{
    public const NONE = 'none';

    public const RECAPTCHA = 'recaptcha';

    public const TURNSTILE = 'turnstile';

    public const PROVIDERS = [self::NONE, self::RECAPTCHA, self::TURNSTILE];

    public function __construct(private HttpFactory $http)
    {
    }

    /** What is in use. A panel from before this setting existed keeps what its reCAPTCHA switch says. */
    public function provider(): string
    {
        $set = (string) config('auth.captcha.provider', '');
        if (in_array($set, self::PROVIDERS, true)) {
            return $set;
        }

        return config('recaptcha.enabled') ? self::RECAPTCHA : self::NONE;
    }

    public function enabled(): bool
    {
        return $this->provider() !== self::NONE;
    }

    /** The public key the browser needs, empty for none. */
    public function siteKey(): string
    {
        return match ($this->provider()) {
            self::RECAPTCHA => (string) config('recaptcha.website_key', ''),
            self::TURNSTILE => (string) config('auth.captcha.turnstile.site_key', ''),
            default => '',
        };
    }

    /** The answer the browser sent, whichever name the form used for it. */
    public function responseFrom(Request $request): string
    {
        foreach (['captcha', 'g-recaptcha-response', 'cf-turnstile-response'] as $field) {
            $value = $request->input($field);
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return '';
    }

    /**
     * Whether the answer is good. With no captcha every request is. A service that cannot be reached counts as a failure: a
     * form that lets everyone through when the check is down is a form without a check.
     *
     * @return array{ok: bool, hostname: string|null}
     */
    public function verify(Request $request): array
    {
        $provider = $this->provider();
        if ($provider === self::NONE) {
            return ['ok' => true, 'hostname' => null];
        }

        $response = $this->responseFrom($request);
        if ($response === '' || strlen($response) > 4096) {
            return ['ok' => false, 'hostname' => null];
        }

        [$url, $secret] = $provider === self::TURNSTILE
            ? [(string) config('auth.captcha.turnstile.domain'), (string) config('auth.captcha.turnstile.secret_key')]
            : [(string) config('recaptcha.domain'), (string) config('recaptcha.secret_key')];

        try {
            $result = $this->http->asForm()->timeout(10)->post($url, array_filter([
                'secret' => $secret,
                'response' => $response,
                'remoteip' => $request->ip(),
            ]));
        } catch (\Throwable) {
            return ['ok' => false, 'hostname' => null];
        }

        $hostname = $result->json('hostname');
        $hostname = is_string($hostname) ? $hostname : null;

        if (!$result->successful() || $result->json('success') !== true) {
            return ['ok' => false, 'hostname' => $hostname];
        }

        // The keys of reCAPTCHA can be used on any site, so the site it was solved on is compared. Turnstile keys are tied to
        // the sites listed for them at Cloudflare, nothing more to do.
        if ($provider === self::RECAPTCHA && config('recaptcha.verify_domain')) {
            $expected = (string) parse_url($request->url(), PHP_URL_HOST);

            return ['ok' => $hostname !== null && hash_equals($expected, $hostname), 'hostname' => $hostname];
        }

        return ['ok' => true, 'hostname' => $hostname];
    }
}

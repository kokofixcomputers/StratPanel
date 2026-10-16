<?php

namespace Pterodactyl\Http\Controllers\Auth;

use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Auth\OAuth\OAuthService;

/**
 * The two addresses of signing in with another service: one sends the browser there, the other is where it comes back to.
 * Both are plain page loads (the service redirects the browser), so what goes wrong is told to the sign in page (or the page
 * of linked services) as a short code in the address, which the page turns into a sentence.
 */
class OAuthController extends Controller
{
    public function __construct(private OAuthService $oauth)
    {
    }

    public function redirect(Request $request, string $provider): RedirectResponse
    {
        $linking = $request->boolean('link');
        $found = $this->oauth->find($provider);

        if ($linking && $request->user() === null) {
            return redirect('/auth/login');
        }
        if (!$linking && $request->user() !== null) {
            return redirect('/');
        }
        if ($found === null) {
            return redirect($linking ? '/account/providers?error=unknown' : '/auth/login?error=unknown');
        }

        return redirect()->away($this->oauth->begin($request, $found, $linking ? OAuthService::LINK : OAuthService::LOGIN));
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        $found = $this->oauth->find($provider);
        $mode = (string) data_get($request->session()->get('oauth'), 'mode', OAuthService::LOGIN);

        if ($found === null) {
            $request->session()->forget('oauth');

            return redirect($mode === OAuthService::LINK ? '/account/providers?error=unknown' : '/auth/login?error=unknown');
        }
        if ($mode === OAuthService::LOGIN && $request->user() !== null) {
            $request->session()->forget('oauth');

            return redirect('/');
        }

        $result = $this->oauth->finish($request, $found);

        return match ($result['type']) {
            'login' => redirect('/'),
            'checkpoint' => redirect('/auth/login/checkpoint?' . http_build_query(['token' => $result['token']])),
            'linked' => redirect('/account/providers?' . http_build_query(['linked' => $found->key])),
            default => redirect(
                ($result['mode'] === OAuthService::LINK ? '/account/providers?' : '/auth/login?')
                . http_build_query(['error' => $result['error'] ?? 'provider'])
            ),
        };
    }
}

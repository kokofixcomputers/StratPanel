<?php

namespace Pterodactyl\Http\Controllers\Auth;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Auth\AuthSettings;
use Pterodactyl\Services\Auth\Passkeys\PasskeyException;
use Pterodactyl\Services\Auth\Passkeys\PasskeyService;

/**
 * Signing in with a passkey. A passkey is something you have and something you are or know (the device asks for a fingerprint, a
 * face or a PIN), so it does not ask for the two-factor code on top.
 */
class PasskeyLoginController extends AbstractLoginController
{
    public function __construct(private PasskeyService $passkeys, private AuthSettings $settings)
    {
        parent::__construct();
    }

    public function options(Request $request): JsonResponse
    {
        abort_unless($this->settings->passkeysEnabled(), 404);

        return new JsonResponse($this->passkeys->loginOptions($request));
    }

    /**
     * @throws DisplayException
     */
    public function login(Request $request): JsonResponse
    {
        abort_unless($this->settings->passkeysEnabled(), 404);

        if ($this->hasTooManyLoginAttempts($request)) {
            $this->fireLockoutEvent($request);
            $this->sendLockoutResponse($request);
        }

        $credential = $request->input('credential');
        if (!is_array($credential)) {
            throw new DisplayException('The passkey was not accepted.');
        }

        try {
            $user = $this->passkeys->login($request, $credential);
        } catch (PasskeyException $exception) {
            $this->incrementLoginAttempts($request);

            throw new DisplayException($exception->getMessage());
        }

        return $this->sendLoginResponse($user, $request);
    }
}

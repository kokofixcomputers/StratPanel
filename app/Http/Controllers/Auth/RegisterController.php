<?php

namespace Pterodactyl\Http\Controllers\Auth;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Auth\AuthSettings;
use Pterodactyl\Services\Auth\SelfRegistrationService;

/**
 * Signing up with a username and password, when an admin allowed it (Settings > Authentication).
 */
class RegisterController extends AbstractLoginController
{
    public function __construct(private AuthSettings $settings, private SelfRegistrationService $registration)
    {
        parent::__construct();
    }

    /**
     * @throws \Illuminate\Validation\ValidationException
     * @throws \Pterodactyl\Exceptions\Model\DataValidationException
     */
    public function __invoke(Request $request): JsonResponse
    {
        // A panel that does not allow it does not pretend to have the page.
        abort_unless($this->settings->passwordRegistration(), 404);

        $rules = User::getRules();
        $data = $request->validate([
            'username' => $rules['username'],
            'email' => $rules['email'],
            'password' => ['required', 'string', 'confirmed', 'min:8', 'max:191'],
        ]);

        $user = $this->registration->create($data['username'], $data['email'], $data['password']);

        return $this->sendLoginResponse($user, $request);
    }
}

<?php

namespace Pterodactyl\Http\Middleware;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Pterodactyl\Events\Auth\FailedCaptcha;
use Illuminate\Contracts\Events\Dispatcher;
use Pterodactyl\Services\Auth\Captcha\CaptchaService;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Checks the captcha on a form. It started out as the reCAPTCHA check, the name stayed because routes and extensions use the
 * "recaptcha" alias. What is checked (reCAPTCHA, Turnstile or nothing) is set under Settings > Authentication.
 */
class VerifyReCaptcha
{
    public function __construct(private Dispatcher $dispatcher, private CaptchaService $captcha)
    {
    }

    public function handle(Request $request, \Closure $next): mixed
    {
        if (!$this->captcha->enabled()) {
            return $next($request);
        }

        $result = $this->captcha->verify($request);
        if ($result['ok']) {
            return $next($request);
        }

        $this->dispatcher->dispatch(new FailedCaptcha((string) $request->ip(), (string) $result['hostname']));

        throw new HttpException(Response::HTTP_BAD_REQUEST, 'Failed to validate the captcha.');
    }
}

<?php

namespace Pterodactyl\Services\Auth\OAuth;

/**
 * Something went wrong while signing in with a service. The code is what the sign in page gets in its address (never free text,
 * the address can be written by anyone) and has a sentence for it in the browser.
 */
class OAuthException extends \RuntimeException
{
    public function __construct(public readonly string $reason, string $message = '')
    {
        parent::__construct($message !== '' ? $message : $reason);
    }
}

<?php

namespace Pterodactyl\Http\Controllers;

use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Pterodactyl\Models\AcmeChallenge;

/**
 * Where Let's Encrypt looks to see that we control a domain: /.well-known/acme-challenge/<token> over http. The answer is whatever the
 * panel put in the database for that token a moment ago. It is public by nature, and gives nothing but the answer to a question that
 * was asked by the panel itself.
 */
class AcmeChallengeController extends Controller
{
    public function __invoke(string $token): Response
    {
        $content = AcmeChallenge::answer($token);
        abort_if($content === null, 404);

        return new Response($content, 200, ['Content-Type' => 'text/plain', 'Cache-Control' => 'no-store']);
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Api\Router;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Pterodactyl\Services\Certificates\CertificateService;

/**
 * The certificates, with their private keys, for panel-edge. This has a secret of its own (not the one of the Minecraft router, which
 * can run on another machine): the keys are given to whoever has this one, and to nobody else.
 */
class CertificatesController extends Controller
{
    public function __construct(private CertificateService $certificates)
    {
    }

    public function __invoke(Request $request): JsonResponse|Response
    {
        $secret = (string) config('certificates.token');
        $given = (string) $request->bearerToken();

        if ($secret === '' || !hash_equals($secret, $given)) {
            return new JsonResponse(['errors' => [['code' => 'Unauthorized', 'status' => '401', 'detail' => 'Invalid token.']]], 401);
        }

        $list = $this->certificates->forEdge();
        $this->certificates->edgeSeen((string) $request->ip(), count($list['certificates']), array_filter(array_map('trim', explode(',', (string) $request->header('X-Edge-Features')))));

        // panel-edge asks every minute, it only needs the keys again when something changed.
        if ($request->header('If-None-Match') === $list['etag']) {
            return (new Response('', 304))->header('ETag', $list['etag'])->header('Cache-Control', 'no-store');
        }

        return (new JsonResponse($list))->header('ETag', $list['etag'])->header('Cache-Control', 'no-store');
    }
}

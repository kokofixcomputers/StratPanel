<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Certificate;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Nodes\NodeCertificateService;
use Pterodactyl\Services\Nodes\NodeCertificateException;

/** The https certificate of a node, for the admin pages: which one it uses, and giving it to the node. */
class NodeCertificateController extends Controller
{
    public function __construct(private NodeCertificateService $service)
    {
    }

    public function view(int $node): JsonResponse
    {
        return new JsonResponse($this->state(Node::query()->findOrFail($node)));
    }

    public function update(Request $request, int $node): JsonResponse
    {
        $found = Node::query()->findOrFail($node);
        $data = $request->validate(['certificate' => 'nullable|string|max:20']);
        $choice = (string) ($data['certificate'] ?? '');

        if ($choice === 'auto' || $choice === '') {
            $this->service->choose($found, null, $choice === 'auto');
        } else {
            $this->service->choose($found, Certificate::query()->findOrFail((int) $choice)->id, false);
        }

        return new JsonResponse($this->state($found->refresh()));
    }

    /** Gives the node the certificate that is chosen for it (and its key). */
    public function push(Request $request, int $node): JsonResponse
    {
        $found = Node::query()->findOrFail($node);
        $certificate = $this->service->assigned($found);
        if ($certificate === null) {
            return $this->failed('No certificate is chosen for this node, or none covers ' . $found->fqdn . '.');
        }

        try {
            $this->service->push($found, $certificate, $request->boolean('confirm'));
        } catch (NodeCertificateException $exception) {
            return $this->failed($exception->getMessage(), $exception->needsConfirmation);
        }

        return new JsonResponse(['ok' => true, 'message' => $certificate->name . ' was given to the node, it is in use for the next connection.'] + $this->state($found->refresh()));
    }

    /** Gives the node the certificate and then switches the panel to https for it, when that works. */
    public function enableHttps(Request $request, int $node): JsonResponse
    {
        $found = Node::query()->findOrFail($node);
        $certificate = $this->service->assigned($found);
        if ($certificate === null) {
            return $this->failed('No certificate is chosen for this node, or none covers ' . $found->fqdn . '.');
        }

        try {
            $result = $this->service->enableHttps($found, $certificate, $request->boolean('confirm'));
        } catch (NodeCertificateException $exception) {
            return $this->failed($exception->getMessage(), $exception->needsConfirmation);
        }

        return new JsonResponse(['ok' => $result['switched'], 'message' => $result['message']] + $this->state($found->refresh()));
    }

    private function failed(string $message, bool $needsConfirmation = false): JsonResponse
    {
        // "error" is the text the app shows for a failed request.
        return new JsonResponse(['ok' => false, 'error' => $message, 'message' => $message, 'needs_confirmation' => $needsConfirmation], 400);
    }

    /** @return array<string, mixed> */
    private function state(Node $node): array
    {
        $certificates = Certificate::query()->where('enabled', true)->orderBy('name')->get();
        $assigned = $this->service->assigned($node);
        $candidate = $this->service->candidate($node);

        return [
            'node' => [
                'id' => $node->id,
                'fqdn' => $node->fqdn,
                'scheme' => $node->scheme,
                'port' => $node->daemonListen,
                'certificate_id' => $node->certificate_id,
                'certificate_auto' => (bool) $node->certificate_auto,
                'pushed_at' => $node->certificate_pushed_at?->toIso8601String(),
                'error' => $node->certificate_error,
            ],
            'certificates' => $certificates->map(fn (Certificate $certificate) => [
                'id' => $certificate->id,
                'name' => $certificate->name,
                'domains' => array_slice($certificate->domains, 0, 3),
                'covers' => NodeCertificateService::covers($certificate, $node->fqdn),
            ])->values()->all(),
            'candidate' => $candidate ? ['id' => $candidate->id, 'name' => $candidate->name] : null,
            'assigned' => $assigned ? ['id' => $assigned->id, 'name' => $assigned->name, 'fingerprint' => $assigned->fingerprint] : null,
            'live' => $this->service->live($node),
        ];
    }
}

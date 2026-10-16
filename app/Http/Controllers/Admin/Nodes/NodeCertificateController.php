<?php

namespace Pterodactyl\Http\Controllers\Admin\Nodes;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Models\Certificate;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Nodes\NodeCertificateException;
use Pterodactyl\Services\Nodes\NodeCertificateService;

/**
 * Nodes > a node > Certificate: the https certificate the node serves its console and file transfers with, given to it by the panel.
 */
class NodeCertificateController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private NodeCertificateService $service)
    {
    }

    public function index(Node $node): View
    {
        $certificates = Certificate::query()->where('enabled', true)->orderBy('name')->get();

        return view('admin.nodes.view.certificate', [
            'node' => $node,
            'certificates' => $certificates,
            'covering' => $certificates->filter(fn (Certificate $c) => NodeCertificateService::covers($c, $node->fqdn))->pluck('id')->all(),
            'assigned' => $this->service->assigned($node),
            'candidate' => $this->service->candidate($node),
            'live' => $this->service->live($node),
        ]);
    }

    /** Saves which certificate this node follows. A change is given to the node at once when it can be done safely. */
    public function update(Request $request, Node $node): RedirectResponse
    {
        $data = $request->validate(['certificate' => 'nullable|string|max:20']);
        $choice = (string) ($data['certificate'] ?? '');

        if ($choice === 'auto' || $choice === '') {
            $this->service->choose($node, null, $choice === 'auto');
        } else {
            $certificate = Certificate::query()->findOrFail((int) $choice);
            $this->service->choose($node, $certificate->id, false);
        }
        $this->alert->success('The choice was saved.' . ($node->scheme === 'https' ? ' A changed certificate is given to the node within the hour, or press Push now.' : ''))->flash();

        return redirect()->route('admin.nodes.view.certificate', $node->id);
    }

    public function push(Request $request, Node $node): RedirectResponse
    {
        $certificate = $this->service->assigned($node);
        if ($certificate === null) {
            $this->alert->danger('No certificate is chosen for this node, or none covers ' . $node->fqdn . '.')->flash();

            return redirect()->route('admin.nodes.view.certificate', $node->id);
        }

        try {
            $this->service->push($node, $certificate, $request->boolean('confirm'));
            $this->alert->success($certificate->name . ' was given to the node, it is in use for the next connection.')->flash();
        } catch (NodeCertificateException $exception) {
            $this->alert->danger($exception->getMessage())->flash();
            if ($exception->needsConfirmation) {
                $request->session()->flash('needs_confirmation', true);
            }
        }

        return redirect()->route('admin.nodes.view.certificate', $node->id);
    }

    public function enableHttps(Request $request, Node $node): RedirectResponse
    {
        $certificate = $this->service->assigned($node);
        if ($certificate === null) {
            $this->alert->danger('No certificate is chosen for this node, or none covers ' . $node->fqdn . '.')->flash();

            return redirect()->route('admin.nodes.view.certificate', $node->id);
        }

        try {
            $result = $this->service->enableHttps($node, $certificate, $request->boolean('confirm'));
            $this->alert->{$result['switched'] ? 'success' : 'warning'}($result['message'])->flash();
        } catch (NodeCertificateException $exception) {
            $this->alert->danger($exception->getMessage())->flash();
            if ($exception->needsConfirmation) {
                $request->session()->flash('needs_confirmation', true);
            }
        }

        return redirect()->route('admin.nodes.view.certificate', $node->id);
    }
}

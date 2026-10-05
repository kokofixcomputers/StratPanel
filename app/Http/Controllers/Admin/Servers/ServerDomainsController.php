<?php

namespace Pterodactyl\Http\Controllers\Admin\Servers;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Models\Server;
use Illuminate\Http\RedirectResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\ServerDomain;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;

/**
 * Lets administrators manage the custom domains of any server. Unlike the client API this ignores the per server
 * domain limit.
 */
class ServerDomainsController extends Controller
{
    public function __construct(private AlertsMessageBag $alert)
    {
    }

    public function index(Server $server): View
    {
        $target = ServerDomain::routerTargetIp();

        return view('admin.servers.view.domains', [
            'server' => $server->load('allocations'),
            'domains' => ServerDomain::query()->with('allocation')->where('server_id', $server->id)->orderBy('domain')->get(),
            'enabled' => (bool) config('pterodactyl.domains.enabled'),
            'targetIp' => $target,
            'max' => (int) config('pterodactyl.domains.max_per_server'),
        ]);
    }

    /**
     * @throws \Pterodactyl\Exceptions\DisplayException
     */
    public function store(Request $request, Server $server): RedirectResponse
    {
        if (!config('pterodactyl.domains.enabled')) {
            throw new DisplayException('Custom domains are not enabled on this panel.');
        }

        $request->merge(['domain' => strtolower(rtrim(trim((string) $request->input('domain')), '.'))]);
        $data = $request->validate([
            'domain' => [
                'required',
                'string',
                'max:253',
                'regex:/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/',
                Rule::unique('server_domains', 'domain'),
            ],
            'allocation_id' => ['required', 'integer'],
        ], [
            'domain.regex' => 'Enter a valid domain name such as play.example.com.',
            'domain.unique' => 'That domain is already in use.',
        ]);

        $panelHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
        if ($panelHost !== '' && $data['domain'] === $panelHost) {
            throw new DisplayException('The domain of the panel itself cannot be used for a server.');
        }

        $allocation = $server->allocations()->where('id', (int) $data['allocation_id'])->first();
        if (is_null($allocation)) {
            throw new DisplayException('That allocation does not belong to this server.');
        }

        ServerDomain::query()->create([
            'server_id' => $server->id,
            'allocation_id' => $allocation->id,
            'domain' => $data['domain'],
        ]);

        Activity::event('server:domain.create')
            ->property(['domain' => $data['domain'], 'allocation' => $allocation->toString()])
            ->log();

        $this->alert->success("The domain {$data['domain']} was added.")->flash();

        return redirect()->route('admin.servers.view.domains', $server->id);
    }

    public function destroy(Server $server, int $domain): RedirectResponse
    {
        $record = ServerDomain::query()->where('server_id', $server->id)->findOrFail($domain);
        $record->delete();

        Activity::event('server:domain.delete')->property(['domain' => $record->domain])->log();

        $this->alert->success("The domain {$record->domain} was removed.")->flash();

        return redirect()->route('admin.servers.view.domains', $server->id);
    }
}

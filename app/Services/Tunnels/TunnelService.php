<?php

namespace Pterodactyl\Services\Tunnels;

use Illuminate\Support\Str;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Tunnel;
use Pterodactyl\Models\Allocation;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;
use Pterodactyl\Repositories\Wings\DaemonTunnelRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * Ports of servers that are opened to the internet through a tunnel service (ngrok, Pinggy, playit.gg or a QuickExpose relay), so a server can be played without forwarding a port on
 * the router. An admin turns it on, picks the service and gives its token (Settings > Tunnels); the owner of a server opens a tunnel for one of
 * its allocations on the Network tab. The panel only keeps what is wanted: the node (Wings, which has the ngrok agent built in) asks for it,
 * opens the tunnels and reports the public address back.
 */
class TunnelService
{
    private const ENABLED = 'settings::tunnels:enabled';
    private const TOKEN = 'settings::tunnels:token';
    private const MAX = 'settings::tunnels:max';
    private const PROVIDER = 'settings::tunnels:provider';
    private const BACKEND = 'settings::tunnels:backend';

    /**
     * The services a tunnel can go through, and what each needs. The node does the work (see Wings, tunnel/): ngrok with the agent that is
     * built in, Pinggy over SSH, playit.gg with its API and the playitd daemon.
     */
    public const PROVIDERS = [
        'ngrok' => ['name' => 'ngrok', 'token' => 'ngrok authtoken', 'required' => true, 'backend' => false],
        'pinggy' => ['name' => 'Pinggy', 'token' => 'Pinggy token', 'required' => false, 'backend' => false],
        'playit' => ['name' => 'playit.gg', 'token' => 'playit.gg agent secret key', 'required' => true, 'backend' => false],
        // A relay of the QuickExpose mod that the admin runs: it has no accounts, and no default: the admin gives its address.
        'quickexpose' => ['name' => 'QuickExpose', 'token' => null, 'required' => false, 'backend' => true],
    ];

    /** What a backend address looks like: host, or host:control:tunnel:play, with a scheme in front that is not needed. */
    public const BACKEND_PATTERN = '/^(?:[a-z][a-z0-9+.-]*:\/\/)?[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{0,5}){0,3}\/?$/';

    public function __construct(
        private SettingsRepositoryInterface $settings,
        private Encrypter $encrypter,
        private DaemonTunnelRepository $daemon,
    ) {
    }

    // ---- what the admin set -----------------------------------------------------------------------------------------

    /** Whether people may open tunnels: an admin turned it on and the service has what it needs (a token, except for the free plan of Pinggy; a backend for QuickExpose). */
    public function enabled(): bool
    {
        if (!$this->switchedOn()) {
            return false;
        }
        $info = self::PROVIDERS[$this->provider()];
        if ($info['backend']) {
            return $this->backend() !== '';
        }

        return $this->token() !== null || !$info['required'];
    }

    /** The address of the relay, for the services that are run by the admin (QuickExpose). Never has a default. */
    public function backend(): string
    {
        return trim((string) $this->settings->get(self::BACKEND, ''));
    }

    public function setBackend(?string $backend): void
    {
        $backend = trim((string) $backend);
        $backend === '' ? $this->settings->forget(self::BACKEND) : $this->settings->set(self::BACKEND, $backend);
    }

    /** The service the tunnels go through. */
    public function provider(): string
    {
        $chosen = (string) $this->settings->get(self::PROVIDER, 'ngrok');

        return array_key_exists($chosen, self::PROVIDERS) ? $chosen : 'ngrok';
    }

    public function setProvider(string $provider): void
    {
        $this->settings->set(self::PROVIDER, array_key_exists($provider, self::PROVIDERS) ? $provider : 'ngrok');
    }

    public function switchedOn(): bool
    {
        return $this->settings->get(self::ENABLED, 'false') === 'true';
    }

    /** The token of the tunnel service for the whole panel. */
    public function token(): ?string
    {
        $stored = (string) $this->settings->get(self::TOKEN, '');
        if ($stored === '') {
            return null;
        }
        try {
            return $this->encrypter->decryptString($stored);
        } catch (\Throwable) {
            return null;
        }
    }

    public function setToken(?string $token): void
    {
        $token = trim((string) $token);
        $token === '' ? $this->settings->forget(self::TOKEN) : $this->settings->set(self::TOKEN, $this->encrypter->encryptString($token));
    }

    public function setEnabled(bool $on): void
    {
        $this->settings->set(self::ENABLED, $on ? 'true' : 'false');
    }

    /** How many tunnels a server may have open at once. */
    public function maxPerServer(): int
    {
        return max(1, min(50, (int) $this->settings->get(self::MAX, 1)));
    }

    public function setMaxPerServer(int $max): void
    {
        $this->settings->set(self::MAX, (string) max(1, min(50, $max)));
    }

    /** The token a node opens its tunnels with: its own, or the one of the panel. */
    public function tokenFor(Node $node): ?string
    {
        $own = $node->tunnel_token;

        return is_string($own) && $own !== '' ? $own : $this->token();
    }

    // ---- opening and closing -----------------------------------------------------------------------------------------

    /**
     * Asks for a tunnel to an allocation of a server. The node opens it in the background, the row says how it goes.
     *
     * @throws DisplayException
     */
    public function open(Server $server, Allocation $allocation): Tunnel
    {
        if (!$this->enabled()) {
            throw new DisplayException('Tunnels are not turned on for this panel.');
        }
        if ($allocation->server_id !== $server->id) {
            throw new DisplayException('That port does not belong to this server.');
        }
        if ($this->tokenFor($server->node) === null && self::PROVIDERS[$this->provider()]['required']) {
            throw new DisplayException('This node has no tunnel token.');
        }

        $existing = Tunnel::query()->where('allocation_id', $allocation->id)->first();
        if ($existing && $existing->status !== Tunnel::FAILED) {
            throw new DisplayException('That port has a tunnel already.');
        }
        if (!$existing && Tunnel::query()->where('server_id', $server->id)->count() >= $this->maxPerServer()) {
            throw new DisplayException('This server can have ' . $this->maxPerServer() . ' ' . Str::plural('tunnel', $this->maxPerServer()) . ' open, close one first.');
        }

        $tunnel = Tunnel::query()->updateOrCreate(
            ['allocation_id' => $allocation->id],
            ['server_id' => $server->id, 'status' => Tunnel::PENDING, 'address' => null, 'error' => null]
        );
        $this->syncNode($server->node, $tunnel);

        return $tunnel->refresh();
    }

    /** Closes a tunnel. */
    public function close(Tunnel $tunnel): void
    {
        $node = $tunnel->server->node;
        $tunnel->delete();
        $this->syncNode($node);
    }

    /** What the node is told it should have open: the token, and the ports of the servers that have a tunnel. */
    public function configFor(Node $node): array
    {
        $tunnels = Tunnel::query()->with(['allocation', 'server:id,uuid'])
            ->whereHas('server', fn ($q) => $q->where('node_id', $node->id))
            ->get()
            // The port may have been taken from the server since.
            ->filter(fn (Tunnel $tunnel) => $tunnel->allocation && $tunnel->allocation->server_id === $tunnel->server_id);

        return [
            'provider' => $this->provider(),
            'backend' => self::PROVIDERS[$this->provider()]['backend'] ? $this->backend() : null,
            'token' => $this->enabled() && self::PROVIDERS[$this->provider()]['token'] !== null ? $this->tokenFor($node) : null,
            'tunnels' => $this->enabled() ? $tunnels->map(fn (Tunnel $tunnel) => [
                'id' => $tunnel->id,
                'ip' => $tunnel->allocation->ip,
                'port' => $tunnel->allocation->port,
                // It is open while this server runs.
                'server' => $tunnel->server->uuid,
            ])->values()->all() : [],
        ];
    }

    /** What the node says about a tunnel. */
    public function report(Tunnel $tunnel, string $state, ?string $address, ?string $message): void
    {
        $status = in_array($state, [Tunnel::ACTIVE, Tunnel::WAITING], true) ? $state : Tunnel::FAILED;
        $tunnel->forceFill([
            'status' => $status,
            'address' => $status === Tunnel::ACTIVE ? $address : null,
            // A tunnel that waits for its server has nothing wrong with it.
            'error' => $status === Tunnel::FAILED ? Str::limit((string) $message, 500) : null,
        ])->save();
    }

    /**
     * Tells the node to look at what is wanted. A node that can not be reached finds out when it starts and every few minutes, so this only
     * marks the tunnel it was about as failed (it can be tried again).
     */
    public function syncNode(Node $node, ?Tunnel $about = null): void
    {
        try {
            $this->daemon->setNode($node)->sync();
        } catch (DaemonConnectionException $exception) {
            Log::warning('Could not tell node ' . $node->name . ' about its tunnels: ' . $exception->getMessage());
            $about?->forceFill(['status' => Tunnel::FAILED, 'error' => 'The node can not be reached, or is too old to open tunnels.'])->save();
        }
    }
}

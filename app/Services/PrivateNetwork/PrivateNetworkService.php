<?php

namespace Pterodactyl\Services\PrivateNetwork;

use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Allocation;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;
use Pterodactyl\Repositories\Wings\DaemonPrivateNetworkRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/**
 * A private network between servers. When an admin turns it on the panel makes a range of private addresses (10.99.0.0/16, the admin can
 * change it) and gives every node a slice of it (a /24). A server that joins gets an address from the slice of its node, and the servers of
 * the same owner can reach each other on those addresses, on the same node and on other nodes, without the traffic going over the public
 * internet. The nodes (Wings) do the rest: they make an encrypted tunnel (WireGuard) to each other with keys they make themselves, attach
 * the containers and keep the servers of other people out (see Wings, privnet/). The panel only says what is wanted.
 */
class PrivateNetworkService
{
    private const ENABLED = 'settings::private_network:enabled';
    private const RANGE = 'settings::private_network:range';

    public function __construct(
        private SettingsRepositoryInterface $settings,
        private DaemonPrivateNetworkRepository $daemon,
    ) {
    }

    // ---- what the admin set -------------------------------------------------------------------------------------------

    public function enabled(): bool
    {
        return $this->settings->get(self::ENABLED, 'false') === 'true';
    }

    /** The range of the private network, empty until it was turned on. */
    public function range(): string
    {
        return (string) $this->settings->get(self::RANGE, '');
    }

    /**
     * A range that nothing uses: 10.x.0.0/16 for a random x that is not what Docker, Kubernetes or home routers use, and that holds no
     * address of an allocation (nodes that are on 10.x themselves keep working).
     */
    public function suggest(): string
    {
        $taken = Allocation::query()->distinct()->pluck('ip')->all();
        for ($try = 0; $try < 200; ++$try) {
            $range = '10.' . random_int(100, 199) . '.0.0/16';
            if (!$this->containsAny($range, $taken)) {
                return $range;
            }
        }

        return '10.' . random_int(100, 199) . '.0.0/16';
    }

    /**
     * Checks a range: private, big enough for the nodes, and without the address of any allocation.
     *
     * @throws DisplayException
     */
    public function check(string $range): string
    {
        $normal = Cidr::normalize($range);
        if ($normal === null) {
            throw new DisplayException('That is not a range. Use something like 10.99.0.0/16.');
        }
        if (!Cidr::isPrivate($normal)) {
            throw new DisplayException('The range has to be a private one: inside 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 or 100.64.0.0/10.');
        }
        $needed = max(1, Node::query()->where('private_enabled', true)->count());
        if (Cidr::slices($normal) < $needed + 1) {
            throw new DisplayException('That range is too small: each node gets a /24 out of it, so it has to be at least a /' . max(8, 24 - (int) ceil(log($needed + 1, 2))) . ' for ' . $needed . ' nodes.');
        }
        $inside = $this->containsAny($normal, Allocation::query()->distinct()->pluck('ip')->all());
        if ($inside) {
            throw new DisplayException('Some ports of nodes are on addresses inside that range (' . $inside . '), the private network would shadow them. Pick another range.');
        }

        return $normal;
    }

    /** The first of these addresses that is in the range, or null. */
    private function containsAny(string $range, array $ips): ?string
    {
        foreach ($ips as $ip) {
            if (Cidr::contains($range, (string) $ip)) {
                return (string) $ip;
            }
        }

        return null;
    }

    /**
     * Turns the private network on or off, with the range (or the one that was there, or a new suggestion). Every node gets its slice, and
     * the nodes are told.
     *
     * @throws DisplayException
     */
    public function configure(bool $on, ?string $range = null): void
    {
        if ($on) {
            $range = $this->check($range ?: ($this->range() ?: $this->suggest()));
            $changed = $range !== $this->range();
            $this->settings->set(self::RANGE, $range);
            $this->settings->set(self::ENABLED, 'true');
            $this->assignSubnets($changed);
        } else {
            $this->settings->set(self::ENABLED, 'false');
        }

        $this->syncAll();
    }

    // ---- the slices of the nodes and the addresses of the servers --------------------------------------------------------

    /**
     * Gives every node that takes part a slice of the range (one that is inside it already is kept), and takes it from the nodes that do
     * not. Servers that joined get an address from the slice of their node again when it changed.
     *
     * @throws DisplayException
     */
    public function assignSubnets(bool $force = false): void
    {
        $range = $this->range();
        if ($range === '') {
            return;
        }

        DB::transaction(function () use ($range, $force) {
            $nodes = Node::query()->orderBy('id')->get();
            $used = [];
            foreach ($nodes as $node) {
                $index = $node->private_enabled && $node->private_subnet ? Cidr::sliceIndex($range, $node->private_subnet) : null;
                if ($index !== null && !$force && !isset($used[$index])) {
                    $used[$index] = $node->id;
                }
            }

            foreach ($nodes as $node) {
                if (!$node->private_enabled) {
                    $node->forceFill(['private_subnet' => null])->save();
                    continue;
                }
                $index = $node->private_subnet ? Cidr::sliceIndex($range, $node->private_subnet) : null;
                if ($index !== null && ($used[$index] ?? null) === $node->id) {
                    continue;
                }

                // The first slice that is free. The slice 0 is left alone when there is room, 10.99.0.x looks like a mistake.
                $free = null;
                for ($i = Cidr::slices($range) > 1 ? 1 : 0; $i < Cidr::slices($range); ++$i) {
                    if (!isset($used[$i])) {
                        $free = $i;
                        break;
                    }
                }
                if ($free === null) {
                    throw new DisplayException('The range has no slice left for ' . $node->name . ', use a bigger range.');
                }
                $used[$free] = $node->id;
                $node->forceFill(['private_subnet' => Cidr::slice($range, $free), 'private_public_key' => $node->private_public_key])->save();
            }

            // A server whose address is not in the slice of its node any more gets another one.
            Server::query()->whereNotNull('private_address')->with('node')->get()->each(function (Server $server) {
                if (!$server->node->private_subnet || !Cidr::contains($server->node->private_subnet, (string) $server->private_address)) {
                    $server->forceFill(['private_address' => null])->save();
                    $this->allocate($server);
                }
            });
        });
    }

    /** Gives a server the first free address of the slice of its node. A node without a slice leaves it without. */
    private function allocate(Server $server): ?string
    {
        $slice = $server->node->private_subnet;
        if (!$slice) {
            return null;
        }
        $taken = Server::query()->whereNotNull('private_address')->pluck('private_address')->flip();
        foreach (Cidr::hosts($slice) as $address) {
            if (!isset($taken[$address])) {
                $server->forceFill(['private_address' => $address])->save();

                return $address;
            }
        }

        throw new DisplayException('The node has no address left in its slice of the private network.');
    }

    // ---- servers -----------------------------------------------------------------------------------------------------------

    /** Whether a server can join: the private network is on, and its node takes part and has a slice. */
    public function available(Server $server): bool
    {
        return $this->enabled() && $server->node->private_enabled && $server->node->private_subnet;
    }

    /**
     * The server joins: it gets an address, and the nodes are told.
     *
     * @throws DisplayException
     */
    public function join(Server $server): string
    {
        if (!$this->enabled()) {
            throw new DisplayException('The private network is not turned on.');
        }
        if (!$this->available($server)) {
            throw new DisplayException('The node this server runs on is not on the private network, so it cannot join. Ask an administrator to enable it for the node.');
        }
        $address = $server->private_address ?: $this->allocate($server);
        $this->syncAll();

        return (string) $address;
    }

    public function leave(Server $server): void
    {
        if ($server->private_address) {
            $server->forceFill(['private_address' => null])->save();
            $this->syncAll();
        }
    }

    // ---- what the nodes ask --------------------------------------------------------------------------------------------------

    /**
     * What a node should have: whether it takes part, its slice, the other nodes to make a tunnel to (those that told their public key), and
     * the servers that joined with their owner, which is who may reach whom.
     *
     * @return array<string, mixed>
     */
    public function configFor(Node $node): array
    {
        $on = $this->enabled() && $node->private_enabled && $node->private_subnet;
        if (!$on) {
            return ['enabled' => false];
        }

        // A server that moved to this node (a transfer) has an address of the slice of another one: it gets one from this slice.
        Server::query()->where('node_id', $node->id)->whereNotNull('private_address')->with('node')->get()->each(function (Server $server) use ($node) {
            if (!Cidr::contains((string) $node->private_subnet, (string) $server->private_address)) {
                $server->forceFill(['private_address' => null])->save();
                $this->allocate($server);
            }
        });

        $nodes = Node::query()->where('private_enabled', true)->whereNotNull('private_subnet')->get();

        return [
            'enabled' => true,
            'range' => $this->range(),
            'subnet' => $node->private_subnet,
            'gateway' => Cidr::gateway($node->private_subnet),
            'port' => (int) $node->private_port,
            'peers' => $nodes->where('id', '!=', $node->id)->filter(fn (Node $other) => $other->private_public_key)->map(fn (Node $other) => [
                'name' => $other->name,
                'endpoint' => $other->fqdn . ':' . $other->private_port,
                'public_key' => $other->private_public_key,
                'subnet' => $other->private_subnet,
            ])->values()->all(),
            'servers' => Server::query()->whereNotNull('private_address')->whereIn('node_id', $nodes->pluck('id'))->get(['uuid', 'private_address', 'owner_id', 'node_id'])
                ->map(fn (Server $server) => [
                    'uuid' => $server->uuid,
                    'address' => $server->private_address,
                    'group' => $server->owner_id,
                    'node' => $server->node_id,
                ])->values()->all(),
        ];
    }

    /**
     * What a node says about itself: its public key (it makes the key, nobody has to), and how it is doing. A new key means the others have to
     * hear about it.
     */
    public function report(Node $node, ?string $key, string $state, ?string $message): void
    {
        $changed = $key !== null && $key !== $node->private_public_key;
        $node->forceFill([
            'private_public_key' => $key ?? $node->private_public_key,
            'private_state' => in_array($state, ['ready', 'error', 'off'], true) ? $state : 'error',
            'private_message' => $message,
            'private_reported_at' => now(),
        ])->save();

        if ($changed) {
            $this->syncAll($node);
        }
    }

    /** Tells the nodes that take part to look at what is wanted (the one that is named is left out, it just asked). */
    public function syncAll(?Node $except = null): void
    {
        Node::query()->where('private_enabled', true)->orWhereNotNull('private_subnet')->get()->each(function (Node $node) use ($except) {
            if ($except && $node->id === $except->id) {
                return;
            }
            $this->sync($node);
        });
    }

    public function sync(Node $node): void
    {
        try {
            $this->daemon->setNode($node)->sync();
        } catch (DaemonConnectionException $exception) {
            // A node that can not be reached asks again every minute and when it starts.
            Log::info('Could not tell node ' . $node->name . ' about the private network: ' . $exception->getMessage());
        }
    }
}

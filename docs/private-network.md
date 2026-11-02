# Private network

Servers can reach each other on private addresses, on one node and between nodes, without the traffic going over the public internet. It is
**off by default**: **Admin > Settings > Private network** turns it on. Nothing else is set up by hand, no keys, no addresses, no routes.

## Turning it on

1. Switch it on. A range is made for you (`10.1xx.0.0/16`, one that no allocation of a node is inside); leave it or change it. It has to be a private
   range (10.x, 172.16-31.x, 192.168.x, 100.64-127.x) and big enough: every node gets a `/24` slice of it.
2. Press **Save**. The panel gives every node that takes part (all of them, until switched off in the list) a slice and tells the nodes. Within
   a minute each node has set itself up and says so; the list shows *Working*, *Problem* (hover for why) or *Waiting for the node*.
3. The owner of a server presses **Join** on the Network tab and gets an address from the slice of the node, like `10.142.3.2`. The servers of the
   same owner that joined reach each other on those addresses, with the port the server listens on (for Velocity: in `velocity.toml`).

Needs the Stratosphere Wings of this release on the nodes, a kernel with WireGuard (built in since Linux 5.6), root and iptables (Docker has them).
The nodes must reach each other on a UDP port (51820 by default, set per node) at their FQDN: the node opens it in iptables, a firewall of a
cloud provider has to be told.

## How it works

* The panel keeps the range, the slice of every node and the address of every server that joined (`nodes.private_*`, `servers.private_address`),
  and says what a node should have (`GET /api/remote/private-network`, and `POST /api/private-network/sync` to Wings when something changes).
* A node makes its own WireGuard key (`<root_directory>/.privnet/wg.key`) and reports the public key to the panel, which gives it to the other
  nodes. That is all the keys there are: nobody handles them.
* The node makes the interface `strat0`, a peer for every other node (allowed addresses: its slice, keepalive 25 s) and a route for each slice
  into the tunnel. It makes the Docker network `stratosphere_private` (bridge `strat_priv0`) with the whole range as its subnet and its slice as
  what it gives out, no NAT, and attaches the containers of the servers that joined with their address. A container asks for an address of
  another node as if it was on the bridge and the node answers (`proxy_arp`).
* Rules (chain `STRAT-PRIVATE` at the top of `DOCKER-USER`): connections that are open continue, a server is reached by the other servers of its
  owner (on every node) and by nobody else, the rest of the range is dropped. Another owner's servers can not reach yours.
* The node looks at what it should have every minute, and attaches containers every few seconds (a container is made again at each start).

## Good to know

* Changing the range gives every node a new slice and every server a new address; the nodes put it right by themselves.
* Taking a node out (or turning the whole network off) removes the tunnel, the network and the rules from it. Servers stay joined.
* A server that is transferred to another node gets an address of the slice of the new node.
* Names do not resolve between nodes, use the addresses. (Names would need a resolver on every node.)
* Tested here: the panel (PHP tests), the logic of the node with fakes (which containers are attached, the rules, a new range, failures), and the
  rules for who reaches whom. **Not tried on real nodes**: WireGuard, the Docker network, iptables and routing between two machines.

Code: `app/Services/PrivateNetwork`, the controllers `PrivateNetworkController` (admin, client and remote), `PrivateNetworkPage.tsx`,
`PrivateNetworkCard.tsx`; tests in `tests/Integration/PrivateNetwork`; Wings: `privnet/`.

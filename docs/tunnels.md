# Tunnels (ngrok)

Servers can be played from the internet without forwarding a port on the router: **Admin > Settings > Tunnels** turns it on, and the owner of a
server opens one of its ports with one click on the **Network** tab.

## Set up

1. Make an account at ngrok.com. Minecraft is TCP, and ngrok gives TCP tunnels only to accounts with a verified payment method (the free
   plan is enough after that).
2. Copy the authtoken (dashboard.ngrok.com > Your Authtoken) into **Admin > Settings > Tunnels**, switch *Let people open tunnels* on and save.
   The token is stored encrypted and never shown again.
3. The nodes need the Stratosphere Wings of this release (`tunnel/` in the Wings repository). The ngrok agent is built into it, nothing else is
   installed on the node. A node that is too old marks the tunnel as failed ("can not be reached, or is too old to open tunnels").

A free ngrok account lets one agent be online at a time. With several nodes give each node an account of its own: the token of a node is set
on the same page (*Tokens of nodes*), a node without one uses the token of the panel.

## What people see

* Network tab: each port has a bar with **Open to the internet**. The node opens the tunnel in a few seconds and the bar shows the address
  players connect to (`0.tcp.eu.ngrok.io:12345`), with a Copy on click and **Close**. A failed tunnel shows why and can be tried again.
* The address is also in the connection menu of the server (next to the domains) and works in the server list of Minecraft.
* A server can have 1 tunnel open at once by default (*Tunnels for each server*). Closing a tunnel, removing the port from the server or
  deleting the server closes it on the node. Opening and closing is in the activity log of the server.
* The address of a free account changes when the tunnel is opened again (the node restarted, the token changed).

## How it works

The panel keeps what is wanted (`tunnels` table: server, allocation, status, address). The node asks `GET /api/remote/tunnels` (token and the
ports of its servers that have a tunnel), opens them and answers `POST /api/remote/tunnels/{id}` with `active` and the address, or `failed`
and why. When something changes the panel tells the node `POST /api/tunnels/sync`; the node also asks when it starts and every three
minutes, which opens a tunnel that failed or went away.

## Limits

* ngrok tunnels TCP: Minecraft Java works, Bedrock (UDP) and voice chat plugins that need UDP do not.
* Players connect through ngrok, so there is a little extra delay, and the bandwidth and terms of the ngrok plan apply.
* Only what is listed here is tested: the panel side with fakes, the node side with a fake tunnel service. Not tried against ngrok itself.

Code: `app/Services/Tunnels/TunnelService.php`, `TunnelController`, `Api/Remote/TunnelsController`, `TunnelBar.tsx`, `TunnelsPage.tsx`; tests in
`tests/Integration/Tunnels` and `tunnel/tunnel_test.go` of Wings.

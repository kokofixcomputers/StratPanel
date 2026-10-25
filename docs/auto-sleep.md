# Auto sleep

A server can be put to sleep when nobody is on it, and woken up when a player tries to join. It gives the memory of an empty
server back to the node, and the player only has to join again. **It is off for every server** until its owner turns it on in the
server's **Settings** page (Auto Sleep). Turning it off again forgets everything about it.

## What the owner chooses

- **On or off** (off by default).
- **How long nobody has been online** before the server sleeps: 5, 10, 15 (default), 30 minutes, 1, 2 or 4 hours.
- **Wake it when a player tries to join** (on by default). This needs the server to have a domain on the Minecraft router (see
  `tools/stratnet/router`), because a stopped server has nothing that could notice a player. Without it the server is started from the
  panel, and the Settings page says so.

Changing it needs the **`settings.auto-sleep`** permission (owners and admins have it, subusers only when it is given to them).
Everybody who can see the server can see what it is set to. A server that is asleep shows **Sleeping** instead of Offline.

## How it works

Once a minute `php artisan p:server:auto-sleep` (part of the panel's scheduler, which already runs every minute from cron) looks at
the servers that have it on:

1. The daemon is asked whether the server is running. Anything else than running starts over.
2. The server is asked how many players are online, the way the server list of the game does (a status ping on its port), so
   **nothing has to be installed on the server**, it works for any Java Edition server.
3. Somebody online: the clock is reset. Nobody: the clock starts, and when it has run for as long as the owner chose, the server
   is stopped normally (`stop`, the world is saved) and marked as asleep.

Nothing is stopped because of a guess: a daemon that does not answer, a server that does not answer the ping (it is starting, or it
is Bedrock Edition, which is not supported), a suspended server, one being installed or transferred are all left alone.

When the router cannot reach a server and the panel says it is **asleep**, the router shows "asleep, join to wake it up" in the
server list. When a player tries to **join**, it asks the panel (`POST /api/router/wake`) to start the server and tells the player to
join again in a minute. Looking at the server list never wakes a server (every refresh would), a server that its owner stopped by hand
is never woken (only one that auto sleep stopped is), and one wake is sent per server every 30 seconds however many players try.

The sleep and wake are in the activity log of the server.

## Settings of the router

The messages can be changed with `SLEEPING_MOTD` and `WAKING_MOTD` in `/etc/stratosphere-net.env`, see `tools/stratnet/router/README.md`. The
router has to be updated for waking to work (`sudo php artisan p:router:install` again installs the new one).

## Limits

- Java Edition only. A server that never answers the ping is never put to sleep.
- The check is one daemon request and one ping per server per minute, one after the other. A few hundred servers with it on is fine,
  thousands would need the check to run in parallel.
- Waking needs a domain for the server on the router, and players to join through it.

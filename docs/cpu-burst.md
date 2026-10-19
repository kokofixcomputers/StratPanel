# CPU burst

A server has a CPU limit (say 200%). With **CPU burst**, a server that stays under its limit saves up the CPU it did not use and can spend it on a short spike *above*
the limit, so a tick spike or a chunk generation does not lag. It never raises the limit for good. This is the CFS burst of the Linux kernel (`cpu.max.burst`,
Linux 5.14 or newer); Wings sets it on the container when the server starts.

* **Admin:** Admin > Nodes > (a node) > Settings > *CPU Burst*: on or off, and how much to save up, as a share of the limit (1 to 100, which is also the most the kernel allows).
  It is on at 100% by default, which is what Wings always did. The panel sends it to Wings together with the other node settings (the `docker.cpu_burst` part of the
  node configuration, also in the config of a node made with `wings configure`), and it applies to a server the next time it starts. Turning it off clears it on the next start too.
  A Wings that does not read it (or `ignore_panel_config_updates: true` on the node) keeps what its own `config.yml` says under `docker.cpu_burst`.
* **Players and owners:** a bolt next to *CPU Usage* on the console page. Grey: burst is ready. Green: the server is bursting now; hovering says for how long
  ("CPU burst active for 12s") and, when it is not, how high it can go and when it last did. A server without a CPU limit, or on a node with burst off, has no bolt.
* **How it knows:** Wings sends the burst counters of the kernel (`cpu.stat`: `nr_bursts`, `burst_usec`) with the stats, as `cpu_burst`; the server is bursting while the
  counter grows, and a burst counts as over after 3 quiet seconds. Without the counter (an older Wings, or a host where the cgroup cannot be read) the bolt guesses from the usage
  being above the limit. The time is counted by the page, so a page opened in the middle of a burst starts counting when it opens.
* A burst is short by design: the kernel allows at most as much saved CPU as the limit, so a spike lasts a moment and then the server is back at its limit.

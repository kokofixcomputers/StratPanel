# Resource pools

By default a person can create a limited number of servers for themselves (`max_servers`). With resource pools the limit is an amount to
spend instead: so much memory, disk space, CPU and so many allocations in total, and as many servers as fit in it.

Off by default. Admin > Settings > **Resource pools**:

- the switch, and what a person gets (memory in MB, disk in MB, CPU in percent, allocations). The defaults are 4096 MB, 10240 MB,
  200% and 5.
- a person's **own pool** is on their page in Users (Resource pool): a field left empty means the default of the panel, so changing the
  default changes what everybody without a pool of their own gets.

## What people see

The "Create a new server" wizard keeps its sliders (memory, disk, CPU) and gets an **Allocations** slider. No slider offers more than is
left in the pool, and the review step shows what would be left after the server: `1 GiB of 4 GiB`, `50% of 200%`, `1 of 5`. When nothing is
left the page says so and tells them to delete a server to get its share back. Ports added to a server later on the Network page come out of
the pool too.

## How it is counted

- What a person has used is counted from the servers they **own**, wherever they were made (memory, disk and CPU of each server, and the
  allocations assigned to them). There is no second ledger: deleting a server gives its share back.
- A server needs at least 512 MB, 1024 MB of disk, 50% CPU and one allocation.
- With a pool a server can have as many allocations as the owner's pool, `allocation_limit` of a server made this way is the whole pool
  of its owner; what is really left decides.
- People who may create servers in the admin area (root admins, roles with `servers.create`) are never limited by a pool.
- Somebody who already has more than the pool allows keeps their servers, they just can not make more until they are under it.
- The role permission `self.servers.create` (deny it to stop somebody from creating servers at all) still applies, see [roles](roles.md).

## For developers

`app/Services/Pools/ResourcePool.php` (`limits`, `used`, `remaining`, `check`, `fit`, `canCreate`); settings are the config keys
`pterodactyl.pools.*` (also from the environment: `PTERODACTYL_POOLS_ENABLED`, `_MEMORY`, `_DISK`, `_CPU`, `_ALLOCATIONS`); a person's own
pool is the columns `pool_memory`, `pool_disk`, `pool_cpu`, `pool_allocations` of `users` (null means the default). The wizard is
`resources/scripts/components/dashboard/CreateServerContainer.tsx`, the arithmetic of "left after" is `resources/scripts/lib/pool.ts`.
Permissions: `settings.pools.view`, `settings.pools.update`, and `users.update` for the pool of a person.

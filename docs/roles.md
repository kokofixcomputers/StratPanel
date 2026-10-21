# Roles and permissions

Roles split the admin area between people. **Root admins** (the accounts that were admins before roles existed) can do everything and
can not be limited. Everybody else is an ordinary user until they are given roles.

## Roles

Admin > **Roles**. A role has a name, a colour and a set of permissions, grouped by area: overview, users, roles, servers, nodes, locations,
database hosts, nests and eggs, mounts, extensions and every page of settings (each with "see" and "change"). A role page lists the people
who have it, and gives it to more people by username or email. A user's own page has a Roles box too.

- Every permission also gives the "see" permission of its group (`servers.delete` includes `servers.view`), the editor ticks it for you.
- Somebody with several roles has all of their permissions.
- The sidebar only shows what a person can open, and they land on the first page they may open. Changes to a role apply to its members
  on their next request.
- `servers.access` is different from the admin pages: it opens every server in the panel itself with full control, like its owner.
- The **Application API** (API keys) and the root admin flag stay for root admins only. Application API keys are not limited by roles.

## Grant, default or deny

Every permission in a role has three states, not two:

- **Default** says nothing. In the admin area that means no access; for what everybody can do (the *Everybody* box at the bottom of the
  editor) it means whatever the panel allows without any role.
- **Grant** gives it. In the admin area that is the permission itself (plus the "see" permission of its group); for what everybody can do
  it also works where the panel has a switch for it off, e.g. a role can let some people create their own servers while the self
  service is off for everyone else.
- **Deny** takes it away from the people who have the role, and wins over a grant of any other role they have. Denying the "see"
  permission of a group (`servers.view`) denies the rest of that group too.

So you can deny creating servers to some people while everybody without a role (or with other roles) still can. What a role can deny
for everybody: `self.servers.create` (the self service of the dashboard), `self.domains.add`, `self.api_keys.create` and
`self.ssh_keys.create`. They are never admin permissions: they do not open the admin area. Root admins are not limited by denials.

A denial needs nothing from the person writing it (it only takes away); a grant of an admin permission needs the permission, as below.

## Nobody gets more than they hold

- A role can only hold permissions that the person making or changing it holds.
- A role can only be changed, deleted, given or taken away by somebody who holds all of its permissions.
- The account of a root admin, or of somebody who holds permissions you do not, can not be edited, deleted or given roles by you
  (with its email or password you would hold them too). Only root admins make root admins.

Changes are written to the activity log (`role:create`, `role:update`, `role:delete`, `role:assign`, `role:revoke`).

## For developers

`$user->hasPermission('servers.view')` is true for root admins and for users whose roles grant it and none denies it. For what
everybody may do by default use `$user->allowedTo('self.servers.create', $panelDefault)`; new ones go in `PermissionRegistry::USER`. Admin routes carry
`->middleware('admin.can:<permission>')` (several, comma separated, means any of them; `admin.can:root` is for root admins only). A test
fails when an admin route has no permission, or a permission is not used by anything. New permissions go in
`app/Services/Roles/PermissionRegistry.php`. The `admin.can` middleware is also available to extensions that add admin routes.

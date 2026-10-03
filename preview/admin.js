/* eslint-disable */
// Renders the *real* resources/views/layouts/admin.blade.php with a tiny Blade subset so that the admin theme can
// be previewed without PHP. Page bodies below are static samples that reuse the markup of the real admin views.
const fs = require('node:fs');
const path = require('node:path');

const layout = fs.readFileSync(path.join(__dirname, '../resources/views/layouts/admin.blade.php'), 'utf8');

const routeToPath = (name) => {
    if (name === 'index') return '/';
    if (name === 'account') return '/account';
    if (name === 'auth.logout' || name === 'auth.login') return '/auth/login';
    if (name === 'admin.index') return '/admin';
    return '/' + name.replace(/\.index$/, '').replace(/\./g, '/');
};

const stripBlocks = (src) => {
    // Remove @if / @foreach ... @endif / @endforeach blocks (nested aware).
    let depth = 0;
    return src
        .split('\n')
        .filter((line) => {
            const t = line.trim();
            const opens = /^@(if|foreach)\b/.test(t);
            const closes = /^@(endif|endforeach)\b/.test(t);
            if (opens) depth++;
            const keep = depth === 0 && !closes;
            if (closes) depth--;
            return keep && !opens;
        })
        .join('\n');
};

const render = (reqPath, { title, header, body }) => {
    let out = layout;
    // footer scripts (jquery etc.) are kept, but the logout confirmation block is wrapped in an @if
    out = stripBlocks(out);
    out = out.replace(/@include\([^)]*\)/g, '');
    out = out.replace(/@section\('[^']*'\)/g, '').replace(/@show/g, '');
    out = out.replace(/\{!! Theme::(css|js)\('([^'?]+)[^']*'\) !!\}/g, (m, kind, file) =>
        kind === 'css'
            ? `<link rel="stylesheet" href="/themes/pterodactyl/${file}">`
            : `<script src="/themes/pterodactyl/${file}"></script>`
    );
    out = out.replace(/\{\{ Route::currentRouteName\(\) !== 'admin\.index' \?: 'active' \}\}/g, reqPath === '/admin' ? 'active' : '');
    out = out.replace(/\{\{ ! starts_with\(Route::currentRouteName\(\), '([^']+)'\) \?: 'active' \}\}/g, (m, name) => {
        const prefix = routeToPath(name);
        return reqPath.startsWith(prefix) ? 'active' : '';
    });
    out = out.replace(/\{\{ route\('([^']+)'\) \}\}/g, (m, name) => routeToPath(name));
    out = out.replace(/\{\{ md5\([^}]*\) \}\}/g, 'preview');
    out = out.replace(/\{\{ config\('app\.name'[^}]*\) \}\}/g, 'Pterodactyl');
    out = out.replace(/\{\{ round\(microtime[^}]*\) \}\}/g, '0.042');
    out = out.replace(/\{\{ \$appIsGit \? '([^']+)' : '[^']+' \}\}/g, '$1');
    out = out.replace(/\{\{ \$appVersion \}\}/g, '1.0-develop');
    out = out.replace(/\{\{ date\('Y'\) \}\}/g, '2026');
    out = out.replace(/\{\{ csrf_token\(\) \}\}/g, 'preview');
    out = out.replace(/\{\{[^}]*\}\}/g, '');
    out = out.replace(/@yield\('title'\)/, title);
    out = out.replace(/@yield\('content-header'\)/, header);
    out = out.replace(/@yield\('content'\)/, body);
    out = out.replace(/@(parent|endsection)\b/g, '');
    return out;
};

const crumbs = (name) => `<ol class="breadcrumb"><li><a href="/admin">Admin</a></li><li class="active">${name}</li></ol>`;
const head = (h, small, crumb) => `<h1>${h}<small>${small}</small></h1>${crumbs(crumb)}`;

const search = (placeholder, create) => `
<div class="box-tools search01">
  <form action="#" method="GET"><div class="input-group input-group-sm">
    <input type="text" class="form-control pull-right" placeholder="${placeholder}">
    <div class="input-group-btn"><button type="submit" class="btn btn-default"><i class="fa fa-search"></i></button>
    <a href="#"><button type="button" class="btn btn-sm btn-primary" style="border-radius: 0 3px 3px 0;margin-left:-1px;">${create}</button></a></div>
  </div></form></div>`;

const pages = {
    '/admin': () => ({
        title: 'Administration',
        header: head('Administrative Overview', 'A quick glance at your system.', 'Index'),
        body: `
<div class="row"><div class="col-xs-12"><div class="box box-success">
  <div class="box-header with-border"><h3 class="box-title">System Information</h3></div>
  <div class="box-body">You are running Pterodactyl Panel version <code>1.0-develop</code>. Your panel is up-to-date!</div>
</div></div></div>
<div class="row">
  <div class="col-xs-6 col-sm-3 text-center"><a href="#"><button class="btn btn-warning" style="width:100%;"><i class="fa fa-fw fa-support"></i> Get Help <small>(via Discord)</small></button></a></div>
  <div class="col-xs-6 col-sm-3 text-center"><a href="#"><button class="btn btn-primary" style="width:100%;"><i class="fa fa-fw fa-link"></i> Documentation</button></a></div>
  <div class="clearfix visible-xs-block">&nbsp;</div>
  <div class="col-xs-6 col-sm-3 text-center"><a href="#"><button class="btn btn-primary" style="width:100%;"><i class="fa fa-fw fa-support"></i> GitHub</button></a></div>
  <div class="col-xs-6 col-sm-3 text-center"><a href="#"><button class="btn btn-success" style="width:100%;"><i class="fa fa-fw fa-money"></i> Support the Project</button></a></div>
</div>`,
    }),

    '/admin/locations': () => ({
        title: 'Locations',
        header: head('Locations', 'All locations that nodes can be assigned to for easier categorization.', 'Locations'),
        body: `
<div class="row"><div class="col-xs-12"><div class="box box-primary">
  <div class="box-header with-border"><h3 class="box-title">Location List</h3>
    <div class="box-tools"><button class="btn btn-sm btn-primary" data-toggle="modal" data-target="#newLocationModal">Create New</button></div></div>
  <div class="box-body table-responsive no-padding"><table class="table table-hover"><tbody>
    <tr><th>ID</th><th>Short Code</th><th>Description</th><th class="text-center">Nodes</th><th class="text-center">Servers</th></tr>
    <tr><td><code>1</code></td><td><a href="#">fra</a></td><td>Frankfurt, Germany</td><td class="text-center">1</td><td class="text-center">3</td></tr>
  </tbody></table></div></div></div></div>
<div class="modal fade" id="newLocationModal" tabindex="-1" role="dialog"><div class="modal-dialog" role="document"><div class="modal-content"><form>
  <div class="modal-header"><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button><h4 class="modal-title">Create Location</h4></div>
  <div class="modal-body"><div class="row">
    <div class="col-md-12"><label for="pShortModal" class="form-label">Short Code</label><input type="text" id="pShortModal" class="form-control" /><p class="text-muted small">A short identifier used to distinguish this location from others. Must be between 1 and 60 characters, for example, <code>us.nyc.lvl3</code>.</p></div>
    <div class="col-md-12"><label for="pLongModal" class="form-label">Description</label><textarea id="pLongModal" class="form-control" rows="4"></textarea><p class="text-muted small">A longer description of this location. Must be less than 191 characters.</p></div>
  </div></div>
  <div class="modal-footer"><button type="button" class="btn btn-default btn-sm pull-left" data-dismiss="modal">Cancel</button><button type="submit" class="btn btn-success btn-sm">Create</button></div>
</form></div></div></div>`,
    }),
    '/admin/nodes/new': () => ({
        title: 'Nodes &rarr; New',
        header: head('New Node', 'Create a new local or remote node for servers to be installed to.', 'New Node'),
        body: `
<form><div class="row">
 <div class="col-sm-6"><div class="box box-primary">
  <div class="box-header with-border"><h3 class="box-title">Basic Details</h3></div>
  <div class="box-body">
   <div class="form-group"><label for="pName" class="form-label">Name</label><input type="text" id="pName" class="form-control"/><p class="text-muted small">Character limits: <code>a-zA-Z0-9_.-</code> and <code>[Space]</code> (min 1, max 100 characters).</p></div>
   <div class="form-group"><label for="pDescription" class="form-label">Description</label><textarea id="pDescription" rows="4" class="form-control"></textarea></div>
   <div class="form-group"><label for="pLocationId" class="form-label">Location</label><select id="pLocationId"><option>fra</option></select></div>
   <div class="form-group"><label class="form-label">Node Visibility</label><div>
     <div class="radio radio-success radio-inline"><input type="radio" id="pPublicTrue" value="1" name="public" checked><label for="pPublicTrue"> Public </label></div>
     <div class="radio radio-danger radio-inline"><input type="radio" id="pPublicFalse" value="0" name="public"><label for="pPublicFalse"> Private </label></div></div>
     <p class="text-muted small">By setting a node to <code>private</code> you will be denying the ability to auto-deploy to this node.</p></div>
   <div class="form-group"><label class="form-label">Behind Proxy</label><div>
     <div class="radio radio-success radio-inline"><input type="radio" id="pProxyFalse" name="behind_proxy" checked><label for="pProxyFalse"> Not Behind Proxy </label></div>
     <div class="radio radio-info radio-inline"><input type="radio" id="pProxyTrue" name="behind_proxy"><label for="pProxyTrue"> Behind Proxy </label></div></div></div>
  </div></div></div>
 <div class="col-sm-6"><div class="box box-primary">
  <div class="box-header with-border"><h3 class="box-title">Configuration</h3></div>
  <div class="box-body"><div class="row">
   <div class="form-group col-md-6"><label class="form-label">Total Memory</label><div class="input-group"><input type="text" class="form-control"/><span class="input-group-addon">MiB</span></div></div>
   <div class="form-group col-md-6"><label class="form-label">Memory Over-Allocation</label><div class="input-group"><input type="text" class="form-control"/><span class="input-group-addon">%</span></div></div>
   <div class="form-group col-md-6"><label class="form-label">Maximum Web Upload Filesize</label><div class="input-group"><input type="text" class="form-control" value="100"/><span class="input-group-addon">MiB</span></div></div>
   <div class="form-group col-md-6"><label class="form-label">Daemon Port</label><input type="text" class="form-control" value="8080"/></div>
   <div class="form-group col-md-12"><label class="form-label">Server limit</label><div class="input-group"><span class="input-group-addon">&le;</span><input type="text" class="form-control"/><span class="input-group-addon">servers</span></div></div>
  </div></div>
  <div class="box-footer"><button type="submit" class="btn btn-success pull-right">Create Node</button></div>
 </div></div>
</div></form>
<div class="box box-default"><div class="box-header with-border"><h3 class="box-title">Actions</h3><div class="box-tools"><div class="btn-group"><button class="btn btn-sm btn-default">Left</button><button class="btn btn-sm btn-default">Mid</button><button class="btn btn-sm btn-default">Right</button></div></div></div>
<div class="box-body"><div class="checkbox checkbox-primary no-margin-bottom"><input type="checkbox" id="chk"><label for="chk"> Delete this server too </label></div>
<span class="label label-success">Active</span> <button class="btn btn-sm btn-danger">Danger</button> <button class="btn btn-sm btn-info">Info</button> <button class="btn btn-sm btn-warning">Warn</button> <button class="btn btn-xs btn-default"><i class="fa fa-trash"></i></button></div></div>
<script>window.addEventListener('load', function () { $('#pLocationId').select2(); });</script>`,
    }),

    '/admin/servers/view/1': () => ({
        title: 'Server — kokotest',
        header: head('kokotest', 'Manage this server.', 'Servers'),
        body: `
<div class="row"><div class="col-xs-12"><div class="nav-tabs-custom nav-tabs-floating"><ul class="nav nav-tabs">
 <li class="active"><a href="#">About</a></li><li><a href="#">Details</a></li><li><a href="#">Build Configuration</a></li><li><a href="#">Startup</a></li><li><a href="#">Database</a></li><li><a href="#">Mounts</a></li><li><a href="#">Manage</a></li>
 <li class="tab-danger"><a href="#">Delete</a></li><li class="tab-success"><a href="#"><i class="fa fa-external-link"></i></a></li></ul></div></div></div>
<div class="row"><div class="col-sm-8"><div class="box"><div class="box-header with-border"><h3 class="box-title">Allocation Management</h3></div>
 <div class="box-body row">
  <div class="form-group col-sm-6"><label>Default Allocation</label><select id="pAllocation" class="form-control"><option>play.example.com:25565</option><option>play.example.com:25566</option></select></div>
  <div class="form-group col-sm-6"><label>Additional Allocation(s)</label><select id="pAllocationAdditional" class="form-control" multiple><option selected>play.example.com:25567</option><option selected>play.example.com:25568</option><option>play.example.com:25569</option></select></div>
 </div></div></div></div>
<script>window.addEventListener('load', function () { $('#pAllocation').select2(); $('#pAllocationAdditional').select2(); });</script>`,
    }),
    '/admin/servers': () => ({
        title: 'List Servers',
        header: head('Servers', 'All servers available on the system.', 'Servers'),
        body: `
<div class="row"><div class="col-xs-12"><div class="box box-primary">
  <div class="box-header with-border"><h3 class="box-title">Server List</h3>${search('Search Servers', 'Create New')}</div>
  <div class="box-body table-responsive no-padding"><table class="table table-hover"><tbody>
    <tr><th>Server Name</th><th>UUID</th><th>Owner</th><th>Node</th><th>Connection</th><th></th><th></th></tr>
    <tr><td><a href="#">kokotest</a></td><td><code>7f3c1d52-9a1e-4b7c-8d2f-1c5e6a9b0d11</code></td><td><a href="#">admin</a></td><td><a href="#">Pterodactyl</a></td><td><code>play.example.com:26614</code></td><td class="text-center"><span class="label label-success">Active</span></td><td class="text-center"><a class="btn btn-xs btn-default" href="/server/7f3c1d52"><i class="fa fa-wrench"></i></a></td></tr>
    <tr><td><a href="#">survival-smp</a></td><td><code>1b2e9d33-4c11-45f8-a7aa-0f53c2d9e711</code></td><td><a href="#">alex</a></td><td><a href="#">Pterodactyl</a></td><td><code>play.example.com:26615</code></td><td class="text-center"><span class="label label-warning">Installing</span></td><td class="text-center"><a class="btn btn-xs btn-default" href="#"><i class="fa fa-wrench"></i></a></td></tr>
    <tr><td><a href="#">old-creative</a></td><td><code>9c0a7e61-2d4b-41c3-b6c8-3a1e5f7d2b90</code></td><td><a href="#">sam</a></td><td><a href="#">Pterodactyl</a></td><td><code>play.example.com:26616</code></td><td class="text-center"><span class="label bg-maroon">Suspended</span></td><td class="text-center"><a class="btn btn-xs btn-default" href="#"><i class="fa fa-wrench"></i></a></td></tr>
  </tbody></table></div>
  <div class="box-footer with-border"><div class="col-md-12 text-center"><ul class="pagination"><li class="disabled"><span>&laquo;</span></li><li class="active"><span>1</span></li><li><a href="#">2</a></li><li><a href="#">&raquo;</a></li></ul></div><div class="clearfix"></div></div>
</div></div></div>`,
    }),
    '/admin/users': () => ({
        title: 'List Users',
        header: head('Users', 'All registered users on the system.', 'Users'),
        body: `
<div class="row"><div class="col-xs-12"><div class="box box-primary">
  <div class="box-header with-border"><h3 class="box-title">User List</h3>${search('Search', 'Create New')}</div>
  <div class="box-body table-responsive no-padding"><table class="table table-hover"><thead><tr><th>ID</th><th>Email</th><th>Client Name</th><th>Username</th><th class="text-center">2FA</th><th class="text-center">Servers Owned</th><th class="text-center">Can Access</th><th></th></tr></thead><tbody>
    <tr><td><code>1</code></td><td><a href="#">admin@example.com</a> <i class="fa fa-star text-yellow"></i></td><td>User, Admin</td><td>admin</td><td class="text-center"><i class="fa fa-lock text-green"></i></td><td class="text-center">2</td><td class="text-center">0</td><td class="text-center"><a href="#"><button class="btn btn-xs btn-primary"><i class="fa fa-wrench"></i></button></a></td></tr>
    <tr><td><code>2</code></td><td><a href="#">alex@example.com</a></td><td>Doe, Alex</td><td>alex</td><td class="text-center"><i class="fa fa-unlock text-red"></i></td><td class="text-center">1</td><td class="text-center">1</td><td class="text-center"><a href="#"><button class="btn btn-xs btn-primary"><i class="fa fa-wrench"></i></button></a></td></tr>
  </tbody></table></div>
</div></div></div>`,
    }),
    '/admin/nodes': () => ({
        title: 'Nodes',
        header: head('Nodes', 'All nodes available on the system.', 'Nodes'),
        body: `
<div class="row"><div class="col-xs-12"><div class="box box-primary">
  <div class="box-header with-border"><h3 class="box-title">Node List</h3>${search('Search Nodes', 'Create New')}</div>
  <div class="box-body table-responsive no-padding"><table class="table table-hover"><tbody>
    <tr><th></th><th>Name</th><th>Location</th><th>Memory</th><th>Disk</th><th class="text-center">Servers</th><th class="text-center">SSL</th><th class="text-center">Public</th></tr>
    <tr><td class="text-center text-muted left-icon"><i class="fa fa-fw fa-heartbeat text-green"></i></td><td><a href="#">Pterodactyl</a></td><td>Frankfurt</td><td>14.2 GB / 32 GB</td><td>120 GB / 500 GB</td><td class="text-center">3</td><td class="text-center"><span class="label label-success">Secure</span></td><td class="text-center"><i class="fa fa-eye"></i></td></tr>
  </tbody></table></div>
</div></div></div>`,
    }),
    '/admin/settings': () => ({
        title: 'Settings',
        header: head('Panel Settings', 'Configure Pterodactyl to your liking.', 'Settings'),
        body: `
<div class="row"><div class="col-xs-12">
  <div class="nav-tabs-custom nav-tabs-floating"><ul class="nav nav-tabs"><li class="active"><a href="#">General</a></li><li><a href="#">Mail</a></li><li><a href="#">Advanced</a></li></ul></div>
  <div class="box"><div class="box-header with-border"><h3 class="box-title">Panel Settings</h3></div>
  <form><div class="box-body"><div class="row">
    <div class="form-group col-md-4"><label class="control-label">Company Name</label><div><input type="text" class="form-control" value="Pterodactyl" /><p class="text-muted small">This is the name that is used throughout the panel and in emails sent to clients.</p></div></div>
    <div class="form-group col-md-4"><label class="control-label">Require 2-Factor Authentication</label><div><div class="btn-group" data-toggle="buttons"><label class="btn btn-primary active"><input type="radio" checked> Not Required</label><label class="btn btn-primary"><input type="radio"> Admin Only</label><label class="btn btn-primary"><input type="radio"> All Users</label></div></div></div>
    <div class="form-group col-md-4"><label class="control-label">Default Language</label><div><select class="form-control"><option>English</option><option>Deutsch</option></select></div></div>
  </div></div><div class="box-footer"><button type="button" class="btn btn-sm btn-primary pull-right">Save</button><div class="clearfix"></div></div></form></div>
  <div class="callout callout-info">Note: changes to some of these settings only apply after the panel cache is cleared.</div>
  <div class="alert alert-danger">There was an error validating the data provided.</div>
  <button class="btn btn-danger" onclick="$('#demoModal').modal('show')">Open modal</button>
</div></div>
<div class="modal fade" id="demoModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
  <div class="modal-header"><button type="button" class="close" data-dismiss="modal"><span>&times;</span></button><h4 class="modal-title">Confirm Deletion</h4></div>
  <div class="modal-body"><p>Are you sure you want to delete this item? This cannot be undone.</p></div>
  <div class="modal-footer"><button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button><button type="button" class="btn btn-danger">Delete</button></div>
</div></div></div>`,
    }),
};

module.exports = (reqPath) => {
    const key = Object.keys(pages).sort((a, b) => b.length - a.length).find((k) => reqPath === k) || null;
    const generic = () => ({
        title: 'Admin',
        header: head(reqPath.split('/').filter(Boolean).slice(1).join(' / ') || 'Admin', 'This section is not part of the preview mock.', 'Preview'),
        body: '<div class="box box-primary"><div class="box-body">This admin page is only available with the full PHP backend.</div></div>',
    });

    return render(reqPath, (key ? pages[key] : generic)());
};

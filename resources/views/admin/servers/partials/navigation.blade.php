@php
    /** @var \Pterodactyl\Models\Server $server */
    $router = app('router');
@endphp
<div class="row">
    <div class="col-xs-12">
        <div class="nav-tabs-custom nav-tabs-floating nav-side">
            <ul class="nav nav-tabs">
                <li class="{{ $router->currentRouteNamed('admin.servers.view') ? 'active' : '' }}">
                    <a href="{{ route('admin.servers.view', $server->id) }}"><i class="fa fa-fw fa-info-circle"></i> About</a></li>
                @if($server->isInstalled())
                    <li class="{{ $router->currentRouteNamed('admin.servers.view.details') ? 'active' : '' }}">
                        <a href="{{ route('admin.servers.view.details', $server->id) }}"><i class="fa fa-fw fa-id-card-o"></i> Details</a>
                    </li>
                    <li class="{{ $router->currentRouteNamed('admin.servers.view.build') ? 'active' : '' }}">
                        <a href="{{ route('admin.servers.view.build', $server->id) }}"><i class="fa fa-fw fa-sliders"></i> Build Configuration</a>
                    </li>
                    <li class="{{ $router->currentRouteNamed('admin.servers.view.startup') ? 'active' : '' }}">
                        <a href="{{ route('admin.servers.view.startup', $server->id) }}"><i class="fa fa-fw fa-terminal"></i> Startup</a>
                    </li>
                    <li class="{{ $router->currentRouteNamed('admin.servers.view.database') ? 'active' : '' }}">
                        <a href="{{ route('admin.servers.view.database', $server->id) }}"><i class="fa fa-fw fa-database"></i> Database</a>
                    </li>
                    <li class="{{ $router->currentRouteNamed('admin.servers.view.mounts') ? 'active' : '' }}">
                        <a href="{{ route('admin.servers.view.mounts', $server->id) }}"><i class="fa fa-fw fa-hdd-o"></i> Mounts</a>
                    </li>
                    <li class="{{ $router->currentRouteNamed('admin.servers.view.domains') ? 'active' : '' }}">
                        <a href="{{ route('admin.servers.view.domains', $server->id) }}"><i class="fa fa-fw fa-globe"></i> Domains</a>
                    </li>
                @endif
                <li class="{{ $router->currentRouteNamed('admin.servers.view.manage') ? 'active' : '' }}">
                    <a href="{{ route('admin.servers.view.manage', $server->id) }}"><i class="fa fa-fw fa-wrench"></i> Manage</a>
                </li>
                <li class="tab-danger {{ $router->currentRouteNamed('admin.servers.view.delete') ? 'active' : '' }}">
                    <a href="{{ route('admin.servers.view.delete', $server->id) }}"><i class="fa fa-fw fa-trash"></i> Delete</a>
                </li>
                <li class="tab-success">
                    <a href="/server/{{ $server->uuidShort }}" target="_blank"><i class="fa fa-fw fa-external-link"></i> Open server</a>
                </li>
            </ul>
        </div>
    </div>
</div>

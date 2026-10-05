@php
    /** @var \Pterodactyl\Models\Node $node */
    $router = app('router');
@endphp
<div class="row">
    <div class="col-xs-12">
        <div class="nav-tabs-custom nav-tabs-floating nav-side">
            <ul class="nav nav-tabs">
                <li class="{{ $router->currentRouteNamed('admin.nodes.view') ? 'active' : '' }}">
                    <a href="{{ route('admin.nodes.view', $node->id) }}"><i class="fa fa-fw fa-info-circle"></i> About</a>
                </li>
                <li class="{{ $router->currentRouteNamed('admin.nodes.view.settings') ? 'active' : '' }}">
                    <a href="{{ route('admin.nodes.view.settings', $node->id) }}"><i class="fa fa-fw fa-cog"></i> Settings</a>
                </li>
                <li class="{{ $router->currentRouteNamed('admin.nodes.view.configuration') ? 'active' : '' }}">
                    <a href="{{ route('admin.nodes.view.configuration', $node->id) }}"><i class="fa fa-fw fa-file-code-o"></i> Configuration</a>
                </li>
                <li class="{{ $router->currentRouteNamed('admin.nodes.view.allocation') ? 'active' : '' }}">
                    <a href="{{ route('admin.nodes.view.allocation', $node->id) }}"><i class="fa fa-fw fa-plug"></i> Allocation</a>
                </li>
                <li class="{{ $router->currentRouteNamed('admin.nodes.view.servers') ? 'active' : '' }}">
                    <a href="{{ route('admin.nodes.view.servers', $node->id) }}"><i class="fa fa-fw fa-server"></i> Servers</a>
                </li>
            </ul>
        </div>
    </div>
</div>

@extends('layouts.admin')

@section('title')
    Administration
@endsection

@section('content-header')
    <h1>Administrative Overview<small>A quick glance at your system.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Index</li>
    </ol>
@endsection

@section('content')
@php
    // Memory and disk are stored in MiB.
    $size = fn (int $mib): string => $mib >= 1024 ? rtrim(rtrim(number_format($mib / 1024, 1, '.', ''), '0'), '.') . ' GiB' : $mib . ' MiB';
    $plural = fn (int $n, string $one, ?string $many = null): string => $n . ' ' . ($n === 1 ? $one : ($many ?? $one . 's'));

    $s = $totals['servers'];
    $serverNotes = array_filter([
        $s['installing'] ? $s['installing'] . ' installing' : null,
        $s['suspended'] ? $s['suspended'] . ' suspended' : null,
        $s['failed'] ? $s['failed'] . ' failed to install' : null,
    ]);
    $u = $totals['users'];
    $userNotes = array_filter([
        $plural($u['admins'], 'admin'),
        $u['two_factor'] . ' with 2FA',
        $u['new'] ? $u['new'] . ' new this week' : null,
    ]);
@endphp
<div class="row stat-row">
    <div class="col-xs-6 col-md-3">
        <a href="{{ route('admin.servers') }}" class="stat-card stat-indigo">
            <span class="stat-icon"><i class="fa fa-server"></i></span>
            <span class="stat-number">{{ $s['total'] }}</span>
            <span class="stat-label">Servers</span>
            <span class="stat-sub">{{ count($serverNotes) ? implode(' · ', $serverNotes) : 'Nothing needs attention' }}</span>
        </a>
    </div>
    <div class="col-xs-6 col-md-3">
        <a href="{{ route('admin.users') }}" class="stat-card stat-pink">
            <span class="stat-icon"><i class="fa fa-users"></i></span>
            <span class="stat-number">{{ $u['total'] }}</span>
            <span class="stat-label">Users</span>
            <span class="stat-sub">{{ implode(' · ', $userNotes) }}</span>
        </a>
    </div>
    <div class="col-xs-6 col-md-3">
        <a href="{{ route('admin.nodes') }}" class="stat-card stat-green">
            <span class="stat-icon"><i class="fa fa-sitemap"></i></span>
            <span class="stat-number">{{ $totals['nodes']['total'] }}</span>
            <span class="stat-label">Nodes</span>
            <span class="stat-sub">{{ $totals['nodes']['maintenance'] ? $totals['nodes']['maintenance'] . ' in maintenance' : 'None in maintenance' }}</span>
        </a>
    </div>
    <div class="col-xs-6 col-md-3">
        <a href="{{ route('admin.servers') }}" class="stat-card stat-amber">
            <span class="stat-icon"><i class="fa fa-globe"></i></span>
            <span class="stat-number">{{ $totals['domains']['total'] }}</span>
            <span class="stat-label">Custom domains</span>
            <span class="stat-sub">Added by your users</span>
        </a>
    </div>
</div>

<div class="row">
    <div class="col-md-8">
        <div class="box">
            <div class="box-header with-border">
                <h3 class="box-title">Nodes</h3>
                <div class="box-tools"><a href="{{ route('admin.nodes') }}" class="btn btn-default btn-xs">Manage</a></div>
            </div>
            @if($nodes->isEmpty())
                <div class="box-body"><div class="ov-empty"><i class="fa fa-sitemap"></i>There are no nodes yet. Servers run on nodes, <a href="{{ route('admin.nodes.new') }}">add the first one</a>.</div></div>
            @else
                <div class="box-body table-responsive no-padding">
                    <table class="table table-hover ov-table">
                        <thead>
                            <tr><th>Node</th><th class="text-center">Servers</th><th style="min-width: 150px;">Memory</th><th style="min-width: 150px;">Disk</th><th class="text-center">Ports</th></tr>
                        </thead>
                        <tbody>
                            @foreach($nodes as $row)
                                <tr>
                                    <td>
                                        <a href="{{ route('admin.nodes.view', $row['node']->id) }}"><strong>{{ $row['node']->name }}</strong></a>
                                        @if($row['node']->maintenance_mode) <span class="label label-warning">Maintenance</span> @endif
                                        <div class="ov-sub">{{ $row['node']->location->short ?? 'No location' }} · {{ $row['node']->fqdn }}</div>
                                    </td>
                                    <td class="text-center">{{ $row['servers'] }}</td>
                                    @foreach(['memory', 'disk'] as $kind)
                                        <td>
                                            <div class="ov-bar ov-{{ $row[$kind]['level'] }}"><span style="width: {{ min(100, $row[$kind]['percent']) }}%"></span></div>
                                            <div class="ov-sub">{{ $size($row[$kind]['used']) }} of {{ $size($row[$kind]['limit']) }}</div>
                                        </td>
                                    @endforeach
                                    <td class="text-center" title="Ports given to servers, of all the ports added to the node">{{ $row['allocations']['used'] }}/{{ $row['allocations']['limit'] }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        </div>
    </div>
    <div class="col-md-4">
        <div class="box">
            <div class="box-header with-border"><h3 class="box-title">Capacity</h3></div>
            <div class="box-body">
                @foreach(['memory' => 'Memory given to servers', 'disk' => 'Disk given to servers'] as $kind => $label)
                    <div class="ov-meter">
                        <div class="ov-meter-head"><span>{{ $label }}</span><strong>{{ $capacity[$kind]['percent'] }}%</strong></div>
                        <div class="ov-bar ov-{{ $capacity[$kind]['level'] }}"><span style="width: {{ min(100, $capacity[$kind]['percent']) }}%"></span></div>
                        <div class="ov-sub">{{ $size($capacity[$kind]['used']) }} of {{ $size($capacity[$kind]['limit']) }} on all nodes</div>
                    </div>
                @endforeach
                <div class="ov-meter">
                    <div class="ov-meter-head"><span>Ports in use</span><strong>{{ $capacity['allocations']['percent'] }}%</strong></div>
                    <div class="ov-bar ov-{{ $capacity['allocations']['level'] }}"><span style="width: {{ min(100, $capacity['allocations']['percent']) }}%"></span></div>
                    <div class="ov-sub">{{ $capacity['allocations']['used'] }} of {{ $capacity['allocations']['limit'] }} allocations have a server</div>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="row">
    <div class="col-md-4">
        <div class="box">
            <div class="box-header with-border"><h3 class="box-title">Servers by egg</h3></div>
            <div class="box-body">
                @forelse($eggs as $egg)
                    <div class="ov-meter">
                        <div class="ov-meter-head"><a href="{{ route('admin.nests.egg.view', $egg->id) }}">{{ $egg->name }}</a><strong>{{ $egg->servers_count }}</strong></div>
                        <div class="ov-bar ov-ok"><span style="width: {{ $s['total'] ? round($egg->servers_count / $s['total'] * 100) : 0 }}%"></span></div>
                    </div>
                @empty
                    <div class="ov-empty"><i class="fa fa-egg"></i>No server uses an egg yet.</div>
                @endforelse
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="box">
            <div class="box-header with-border">
                <h3 class="box-title">Newest servers</h3>
                <div class="box-tools"><a href="{{ route('admin.servers') }}" class="btn btn-default btn-xs">All</a></div>
            </div>
            <div class="box-body ov-list">
                @forelse($recentServers as $server)
                    <a href="{{ route('admin.servers.view', $server->id) }}" class="ov-item">
                        <span class="ov-item-main">{{ $server->name }}</span>
                        <span class="ov-sub">{{ $server->user->username ?? 'No owner' }} · {{ $server->node->name ?? 'No node' }} · {{ $server->created_at->diffForHumans() }}</span>
                    </a>
                @empty
                    <div class="ov-empty"><i class="fa fa-server"></i>There are no servers yet.</div>
                @endforelse
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="box">
            <div class="box-header with-border">
                <h3 class="box-title">Newest users</h3>
                <div class="box-tools"><a href="{{ route('admin.users') }}" class="btn btn-default btn-xs">All</a></div>
            </div>
            <div class="box-body ov-list">
                @forelse($recentUsers as $user)
                    <a href="{{ route('admin.users.view', $user->id) }}" class="ov-item">
                        <span class="ov-item-main">{{ $user->username }} @if($user->root_admin)<span class="label label-primary">Root admin</span>@endif</span>
                        <span class="ov-sub">{{ $user->email }} · joined {{ $user->created_at->diffForHumans() }}</span>
                    </a>
                @empty
                    <div class="ov-empty"><i class="fa fa-users"></i>There are no users yet.</div>
                @endforelse
            </div>
        </div>
    </div>
</div>

<div class="row">
    <div class="col-xs-12">
        <div class="box">
            <div class="box-header with-border"><h3 class="box-title">Recent activity</h3></div>
            @if($activity->isEmpty())
                <div class="box-body"><div class="ov-empty"><i class="fa fa-history"></i>Nothing has been logged yet.</div></div>
            @else
                <div class="box-body table-responsive no-padding">
                    <table class="table table-hover ov-table">
                        <thead><tr><th style="width: 160px;">When</th><th>Event</th><th>Who</th><th>IP address</th></tr></thead>
                        <tbody>
                            @foreach($activity as $log)
                                <tr>
                                    <td title="{{ $log->timestamp }}">{{ $log->timestamp->diffForHumans() }}</td>
                                    <td><code>{{ $log->event }}</code></td>
                                    <td>{{ $log->actor->username ?? 'System' }}</td>
                                    <td class="text-muted">{{ $log->ip }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        </div>
    </div>
</div>

<div class="row">
    <div class="col-xs-6 col-sm-3 text-center">
        <a href="{{ $version->getDiscord() }}"><button class="btn btn-warning" style="width:100%;"><i class="fa fa-fw fa-support"></i> Get Help <small>(via Discord)</small></button></a>
    </div>
    <div class="col-xs-6 col-sm-3 text-center">
        <a href="https://pterodactyl.io"><button class="btn btn-primary" style="width:100%;"><i class="fa fa-fw fa-link"></i> Documentation</button></a>
    </div>
    <div class="clearfix visible-xs-block">&nbsp;</div>
    <div class="col-xs-6 col-sm-3 text-center">
        <a href="https://github.com/pterodactyl/panel"><button class="btn btn-primary" style="width:100%;"><i class="fa fa-fw fa-support"></i> GitHub</button></a>
    </div>
    <div class="col-xs-6 col-sm-3 text-center">
        <a href="{{ $version->getDonations() }}"><button class="btn btn-success" style="width:100%;"><i class="fa fa-fw fa-money"></i> Support the Project</button></a>
    </div>
</div>
@endsection

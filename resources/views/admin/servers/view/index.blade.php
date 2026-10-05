@extends('layouts.admin')

@section('title')
    Server — {{ $server->name }}
@endsection

@section('content-header')
    <h1>{{ $server->name }}<small>{{ str_limit($server->description) }}</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.servers') }}">Servers</a></li>
        <li class="active">{{ $server->name }}</li>
    </ol>
@endsection

@section('content')
@include('admin.servers.partials.navigation')
<div class="row stat-row">
    <div class="col-xs-6 col-md-3">
        <div class="stat-card {{ $server->isSuspended() ? 'stat-amber' : (! $server->isInstalled() ? 'stat-indigo' : 'stat-green') }}">
            <span class="stat-icon"><i class="fa {{ $server->isSuspended() ? 'fa-pause' : (! $server->isInstalled() ? 'fa-download' : 'fa-check') }}"></i></span>
            <span class="stat-number stat-text">{{ $server->isSuspended() ? 'Suspended' : (! $server->isInstalled() ? 'Installing' : 'Active') }}</span>
            <span class="stat-label">Status</span>
        </div>
    </div>
    <div class="col-xs-6 col-md-3">
        <div class="stat-card stat-indigo">
            <span class="stat-icon"><i class="fa fa-microchip"></i></span>
            <span class="stat-number">{{ $server->cpu === 0 ? '∞' : $server->cpu . '%' }}</span>
            <span class="stat-label">CPU limit</span>
        </div>
    </div>
    <div class="col-xs-6 col-md-3">
        <div class="stat-card stat-pink">
            <span class="stat-icon"><i class="fa fa-tasks"></i></span>
            <span class="stat-number">{{ $server->memory === 0 ? '∞' : $server->memory }}<small>{{ $server->memory === 0 ? '' : ' MiB' }}</small></span>
            <span class="stat-label">Memory</span>
        </div>
    </div>
    <div class="col-xs-6 col-md-3">
        <div class="stat-card stat-amber">
            <span class="stat-icon"><i class="fa fa-hdd-o"></i></span>
            <span class="stat-number">{{ $server->disk === 0 ? '∞' : $server->disk }}<small>{{ $server->disk === 0 ? '' : ' MiB' }}</small></span>
            <span class="stat-label">Disk space</span>
        </div>
    </div>
</div>
<div class="row">
    <div class="col-sm-8">
        <div class="row">
            <div class="col-xs-12">
                <div class="box box-primary">
                    <div class="box-header with-border">
                        <h3 class="box-title">Information</h3>
                    </div>
                    <div class="box-body table-responsive no-padding">
                        <table class="table table-hover">
                            <tr>
                                <td>Internal Identifier</td>
                                <td><code>{{ $server->id }}</code></td>
                            </tr>
                            <tr>
                                <td>External Identifier</td>
                                @if(is_null($server->external_id))
                                    <td><span class="label label-default">Not Set</span></td>
                                @else
                                    <td><code>{{ $server->external_id }}</code></td>
                                @endif
                            </tr>
                            <tr>
                                <td>UUID / Docker Container ID</td>
                                <td><code>{{ $server->uuid }}</code></td>
                            </tr>
                            <tr>
                                <td>Current Egg</td>
                                <td>
                                    <a href="{{ route('admin.nests.view', $server->nest_id) }}">{{ $server->nest->name }}</a> ::
                                    <a href="{{ route('admin.nests.egg.view', $server->egg_id) }}">{{ $server->egg->name }}</a>
                                </td>
                            </tr>
                            <tr>
                                <td>Server Name</td>
                                <td>{{ $server->name }}</td>
                            </tr>
                            <tr>
                                <td>CPU Limit</td>
                                <td>
                                    @if($server->cpu === 0)
                                        <code>Unlimited</code>
                                    @else
                                        <code>{{ $server->cpu }}%</code>
                                    @endif
                                </td>
                            </tr>
                            <tr>
                                <td>CPU Pinning</td>
                                <td>
                                    @if($server->threads != null)
                                        <code>{{ $server->threads }}</code>
                                    @else
                                        <span class="label label-default">Not Set</span>
                                    @endif
                                </td>
                            </tr>
                            <tr>
                                <td>Memory</td>
                                <td>
                                    @if($server->memory === 0)
                                        <code>Unlimited</code>
                                    @else
                                        <code>{{ $server->memory }}MiB</code>
                                    @endif
                                    /
                                    @if($server->swap === 0)
                                        <code data-toggle="tooltip" data-placement="top" title="Swap Space">Not Set</code>
                                    @elseif($server->swap === -1)
                                        <code data-toggle="tooltip" data-placement="top" title="Swap Space">Unlimited</code>
                                    @else
                                        <code data-toggle="tooltip" data-placement="top" title="Swap Space"> {{ $server->swap }}MiB</code>
                                    @endif
                                </td>
                            </tr>
                            <tr>
                                <td>Disk Space</td>
                                <td>
                                    @if($server->disk === 0)
                                        <code>Unlimited</code>
                                    @else
                                        <code>{{ $server->disk }}MiB</code>
                                    @endif
                                </td>
                            </tr>
                            <tr>
                                <td>Block IO Weight</td>
                                <td><code>{{ $server->io }}</code></td>
                            </tr>
                            <tr>
                                <td>Default Connection</td>
                                <td><code>{{ $server->allocation->ip }}:{{ $server->allocation->port }}</code></td>
                            </tr>
                            <tr>
                                <td>Connection Alias</td>
                                <td>
                                    @if($server->allocation->alias !== $server->allocation->ip)
                                        <code>{{ $server->allocation->alias }}:{{ $server->allocation->port }}</code>
                                    @else
                                        <span class="label label-default">No Alias Assigned</span>
                                    @endif
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-sm-4">
        <a href="{{ route('admin.users.view', $server->user->id) }}" class="link-card">
            <span class="link-card-icon"><i class="fa fa-user"></i></span>
            <span class="link-card-text">
                <span class="link-card-label">Server owner</span>
                <span class="link-card-value">{{ str_limit($server->user->username, 24) }}</span>
            </span>
            <i class="fa fa-angle-right link-card-arrow"></i>
        </a>
        <a href="{{ route('admin.nodes.view', $server->node->id) }}" class="link-card">
            <span class="link-card-icon"><i class="fa fa-sitemap"></i></span>
            <span class="link-card-text">
                <span class="link-card-label">Node</span>
                <span class="link-card-value">{{ str_limit($server->node->name, 24) }}</span>
            </span>
            <i class="fa fa-angle-right link-card-arrow"></i>
        </a>
        <div class="link-card">
            <span class="link-card-icon"><i class="fa fa-plug"></i></span>
            <span class="link-card-text">
                <span class="link-card-label">Connection</span>
                <span class="link-card-value"><code>{{ $server->allocation->alias }}:{{ $server->allocation->port }}</code></span>
            </span>
        </div>
    </div>
</div>
@endsection

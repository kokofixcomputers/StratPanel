@extends('layouts.admin')

@section('title')
    Server — {{ $server->name }}: Domains
@endsection

@section('content-header')
    <h1>{{ $server->name }}<small>Manage the custom domains of this server.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.servers') }}">Servers</a></li>
        <li><a href="{{ route('admin.servers.view', $server->id) }}">{{ $server->name }}</a></li>
        <li class="active">Domains</li>
    </ol>
@endsection

@section('content')
@include('admin.servers.partials.navigation')
<div class="row">
    <div class="col-sm-7">
        @if(!$enabled)
            <div class="alert alert-warning">Custom domains are turned off for this panel, so new domains cannot be added.</div>
        @endif
        <div class="box box-primary">
            <div class="box-header with-border">
                <h3 class="box-title">Domains <small>{{ $domains->count() }}{{ $max > 0 ? ' / ' . $max : '' }}</small></h3>
            </div>
            <div class="box-body table-responsive no-padding">
                <table class="table table-hover">
                    <tr>
                        <th>Domain</th>
                        <th>Leads to</th>
                        <th>DNS</th>
                        <th></th>
                    </tr>
                    @forelse($domains as $domain)
                        <tr>
                            <td><code>{{ $domain->domain }}</code></td>
                            <td>
                                @if($domain->allocation)
                                    <code>{{ $domain->allocation->alias ?? $domain->allocation->ip }}:{{ $domain->allocation->port }}</code>
                                @else
                                    <span class="text-muted">allocation removed</span>
                                @endif
                            </td>
                            <td>
                                @if($domain->pointsAtRouter($targetIp))
                                    <span class="label label-success">Ready</span>
                                @else
                                    <span class="label label-warning">Waiting for DNS</span>
                                @endif
                            </td>
                            <td class="text-center">
                                <form action="{{ route('admin.servers.view.domains.delete', ['server' => $server->id, 'domain' => $domain->id]) }}" method="POST" onsubmit="return confirm('Remove {{ $domain->domain }}? Players will no longer be able to join through it.');">
                                    {!! method_field('DELETE') !!}
                                    {!! csrf_field() !!}
                                    <button type="submit" class="btn btn-xs btn-danger"><i class="fa fa-trash"></i></button>
                                </form>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="4" class="text-center text-muted" style="padding: 20px;">This server has no domains yet.</td>
                        </tr>
                    @endforelse
                </table>
            </div>
        </div>
    </div>
    <div class="col-sm-5">
        <div class="box box-success">
            <div class="box-header with-border">
                <h3 class="box-title">Add Domain</h3>
            </div>
            <form action="{{ route('admin.servers.view.domains.store', $server->id) }}" method="POST">
                <div class="box-body">
                    <div class="form-group">
                        <label for="pDomain" class="control-label">Domain</label>
                        <input id="pDomain" type="text" name="domain" class="form-control" placeholder="play.example.com" value="{{ old('domain') }}" />
                    </div>
                    <div class="form-group">
                        <label for="pAllocation" class="control-label">Send players to</label>
                        <select id="pAllocation" name="allocation_id" class="form-control">
                            @foreach($server->allocations as $allocation)
                                <option value="{{ $allocation->id }}" @if($allocation->id === $server->allocation_id) selected @endif>
                                    {{ $allocation->alias ?? $allocation->ip }}:{{ $allocation->port }}@if($allocation->id === $server->allocation_id) (primary)@endif
                                </option>
                            @endforeach
                        </select>
                    </div>
                    <p class="text-muted small">
                        The domain needs an <strong>A record</strong> pointing to
                        <code>{{ $targetIp ?: 'the address of this panel' }}</code>, where the Minecraft router is listening.
                        As an administrator you can go over the per server domain limit.
                    </p>
                </div>
                <div class="box-footer">
                    {!! csrf_field() !!}
                    <button type="submit" class="btn btn-success pull-right" @if(!$enabled) disabled @endif>Add Domain</button>
                </div>
            </form>
        </div>
    </div>
</div>
@endsection

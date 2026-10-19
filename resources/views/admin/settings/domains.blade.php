@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'domains'])

@section('title')
    Domains
@endsection

@section('content-header')
    <h1>Domains<small>How people get a domain for their server.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Settings</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    <div class="row">
        <div class="col-md-8">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Names under your domains</h3>
                    <div class="box-tools"><a href="{{ route('admin.settings.domains.new') }}" class="btn btn-default btn-xs"><i class="fa fa-plus"></i> Add a domain</a></div>
                </div>
                @if($zones->isEmpty())
                    <div class="box-body">
                        <div class="ov-empty"><i class="fa fa-globe"></i>No domain yet. Add one and people can type a name such as <code>play</code> and pick <code>.example.com</code>; the panel makes the DNS record.</div>
                    </div>
                @else
                    <div class="box-body table-responsive no-padding">
                        <table class="table table-hover">
                            <thead><tr><th>Domain</th><th>DNS provider</th><th>Status</th><th class="text-center">Names</th></tr></thead>
                            <tbody>
                                @foreach($zones as $zone)
                                    <tr>
                                        <td><a href="{{ route('admin.settings.domains.edit', $zone->id) }}"><strong>{{ $zone->domain }}</strong></a><div class="ov-sub">{{ $zone->name }}</div></td>
                                        <td>{{ $types[$zone->type]['name'] ?? $zone->type }}</td>
                                        <td>@if($zone->enabled)<span class="label label-success">Offered</span>@else<span class="label label-default">Off</span>@endif</td>
                                        <td class="text-center">{{ $zone->domains_count }}</td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @endif
            </div>
        </div>
        <div class="col-md-4">
            <form action="{{ route('admin.settings.domains') }}" method="POST">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Their own domain</h3></div>
                    <div class="box-body">
                        <div class="checkbox checkbox-primary">
                            <input id="custom-enabled" type="checkbox" name="custom_enabled" value="1" @if($customEnabled) checked @endif @if(!Auth::user()->hasPermission('settings.domains.update')) disabled @endif>
                            <label for="custom-enabled">People can bring a domain they own</label>
                        </div>
                        <p class="text-muted small">They add an A record at their own DNS provider that points at <code>{{ $targetIp ?: 'this panel' }}</code>.@if(!$targetIp) Set <code>PTERODACTYL_DOMAINS_TARGET_IP</code>, the address could not be found.@endif</p>
                    </div>
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        {!! method_field('PATCH') !!}
                        <button type="submit" class="btn btn-sm btn-primary pull-right">Save</button>
                    </div>
                </div>
            </form>
            <div class="box">
                <div class="box-header with-border"><h3 class="box-title">How it works</h3></div>
                <div class="box-body">
                    <p class="text-muted small no-margin">
                        A name under your domain is made when the person adds it and removed with it, at the DNS provider of that domain. Both ways can be on at once;
                        the people choose in the Domains page of their server. Names that are kept for the panel (<code>www</code>, <code>mail</code>, <code>admin</code>, ...) cannot be taken.
                    </p>
                </div>
            </div>
        </div>
    </div>
@endsection

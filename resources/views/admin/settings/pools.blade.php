@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'pools'])

@section('title')
    Resource pools
@endsection

@section('content-header')
    <h1>Resource pools<small>Give people an amount to spend on servers instead of a number of servers.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Settings</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    <form action="{{ route('admin.settings.pools') }}" method="POST">
        <div class="row">
            <div class="col-md-7">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Resource pools</h3></div>
                    <div class="box-body">
                        <p class="text-muted">
                            Off by default. When it is on, the servers people create for themselves (the "Create a server" page) are paid from a pool: so much
                            memory, disk space, CPU and so many allocations in total. They can make as many servers as fit, and the wizard shows what is left
                            after the server they are making. The limit on the number of servers no longer applies. Everybody has the defaults below, unless
                            you give a person their own pool on their user page.
                        </p>
                        <div class="checkbox checkbox-primary">
                            <input id="enabled" type="checkbox" name="enabled" value="1" @if(old('enabled', $enabled)) checked @endif>
                            <label for="enabled">Pay the servers people create from a resource pool</label>
                        </div>
                        <hr>
                        <h4 style="margin-top: 0;">What a person gets</h4>
                        <div class="row">
                            <div class="form-group col-sm-6">
                                <label class="control-label" for="memory">Memory (MB)</label>
                                <input id="memory" type="number" name="memory" class="form-control" min="0" required value="{{ old('memory', $defaults['memory']) }}">
                                <p class="text-muted small">4096 is 4 GB.</p>
                            </div>
                            <div class="form-group col-sm-6">
                                <label class="control-label" for="disk">Disk space (MB)</label>
                                <input id="disk" type="number" name="disk" class="form-control" min="0" required value="{{ old('disk', $defaults['disk']) }}">
                                <p class="text-muted small">10240 is 10 GB.</p>
                            </div>
                            <div class="form-group col-sm-6">
                                <label class="control-label" for="cpu">CPU (%)</label>
                                <input id="cpu" type="number" name="cpu" class="form-control" min="0" required value="{{ old('cpu', $defaults['cpu']) }}">
                                <p class="text-muted small">100% is one core, 200% is two.</p>
                            </div>
                            <div class="form-group col-sm-6">
                                <label class="control-label" for="allocations">Allocations</label>
                                <input id="allocations" type="number" name="allocations" class="form-control" min="0" required value="{{ old('allocations', $defaults['allocations']) }}">
                                <p class="text-muted small">Ports in total. A server uses at least one.</p>
                            </div>
                        </div>
                    </div>
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                    </div>
                </div>
            </div>
            <div class="col-md-5">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Good to know</h3></div>
                    <div class="box-body">
                        <ul class="small" style="padding-left: 18px; margin: 0;">
                            <li>What a person has used is counted from the servers they <strong>own</strong>, wherever they were made, so deleting a server gives its share back.</li>
                            <li>The defaults apply to everybody without a pool of their own, so changing them changes what all of them get. A person's own pool is on their page in Users.</li>
                            <li>People who may create servers in the admin area (root admins and roles with <code>servers.create</code>) are never limited by a pool.</li>
                            <li>A person who already has more servers than the pool allows keeps them, they just can not make more until they are under it.</li>
                            <li>Allocations they add to a server on the Network page are paid from the pool too.</li>
                            <li>Right now <strong>{{ $own }}</strong> {{ $own === 1 ? 'person has' : 'people have' }} a pool of their own.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </form>
@endsection

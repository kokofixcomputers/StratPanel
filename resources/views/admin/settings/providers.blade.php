@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'providers'])

@section('title')
    Providers
@endsection

@section('content-header')
    <h1>Providers<small>The services people can sign in with and link to their account.</small></h1>
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
                    <h3 class="box-title">Set up</h3>
                </div>
                @if($providers->isEmpty())
                    <div class="box-body">
                        <p class="text-muted no-margin">Nothing is set up yet. Pick a service on the right to start.</p>
                    </div>
                @else
                    <div class="box-body table-responsive no-padding">
                        <table class="table table-hover">
                            <thead>
                                <tr><th>Name</th><th>Type</th><th>Sign in</th><th>Sign up</th><th class="text-center">Accounts</th></tr>
                            </thead>
                            <tbody>
                                @foreach($providers as $provider)
                                    <tr>
                                        <td><a href="{{ route('admin.settings.providers.edit', $provider->id) }}">{{ $provider->name }}</a> <code>{{ $provider->key }}</code></td>
                                        <td>{{ $types[$provider->type]['name'] ?? $provider->type }}</td>
                                        <td>@if($provider->enabled)<span class="label label-success">On</span>@else<span class="label label-default">Off</span>@endif</td>
                                        <td>@if($provider->allow_signup)<span class="label label-info">Allowed</span>@else<span class="label label-default">No</span>@endif</td>
                                        <td class="text-center">{{ $provider->identities_count }}</td>
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
                <div class="box-header with-border">
                    <h3 class="box-title">Add a provider</h3>
                </div>
                <div class="box-body">
                    @foreach($types as $type => $info)
                        <a href="{{ route('admin.settings.providers.new', ['type' => $type]) }}" class="btn btn-default btn-block" style="text-align: left;">
                            <i class="fa fa-plus"></i> {{ $type === 'oauth2' ? 'Another service (OAuth 2)' : $info['name'] }}
                        </a>
                    @endforeach
                    <p class="text-muted small" style="margin-top: 10px;">
                        People sign in with a provider only when it is switched on here. Signing up with one also needs
                        <a href="{{ route('admin.settings.authentication') }}">self sign up</a> to be on.
                    </p>
                </div>
            </div>
        </div>
    </div>
@endsection

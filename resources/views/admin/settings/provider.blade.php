@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'providers'])

@section('title')
    {{ $exists ? $provider->name : 'Add ' . $preset['name'] }}
@endsection

@section('content-header')
    <h1>{{ $exists ? $provider->name : 'Add ' . $preset['name'] }}<small>Sign in with {{ $preset['name'] }}.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.settings.providers') }}">Providers</a></li>
        <li class="active">{{ $exists ? $provider->name : 'New' }}</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    @php $generic = $provider->type === 'oauth2'; $mapping = $endpoints['mapping']; @endphp
    <form action="{{ $exists ? route('admin.settings.providers.edit', $provider->id) : route('admin.settings.providers.store') }}" method="POST" autocomplete="off">
        <div class="row">
            <div class="col-md-8">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">The application</h3></div>
                    <div class="box-body">
                        <p class="text-muted">
                            Make an application (an "OAuth app") at the service
                            @if($preset['docs'])
                                &mdash; <a href="{{ $preset['docs'] }}" target="_blank" rel="noopener noreferrer">{{ $preset['name'] }} developer settings</a> &mdash;
                            @endif
                            and give it the callback address on the right. Then enter the client ID and secret it gives you.
                        </p>
                        <div class="row">
                            <div class="form-group col-md-6">
                                <label class="control-label" for="name">Name on the button</label>
                                <input id="name" type="text" name="name" class="form-control" required maxlength="60" value="{{ old('name', $provider->name ?: $preset['name']) }}">
                            </div>
                            <div class="form-group col-md-6">
                                <label class="control-label" for="key">Key</label>
                                <input id="key" type="text" name="key" class="form-control" required pattern="[a-z0-9][a-z0-9-]{0,38}[a-z0-9]" maxlength="40"
                                       value="{{ old('key', $provider->key) }}" @if($exists) disabled @endif>
                                <p class="text-muted small">Part of the addresses, lowercase letters, digits and dashes. {{ $exists ? 'It can not be changed.' : 'It can not be changed later.' }}</p>
                            </div>
                        </div>
                        <div class="row">
                            <div class="form-group col-md-6">
                                <label class="control-label" for="client-id">Client ID</label>
                                <input id="client-id" type="text" name="client_id" class="form-control" required spellcheck="false" value="{{ old('client_id', $provider->client_id) }}">
                            </div>
                            <div class="form-group col-md-6">
                                <label class="control-label" for="client-secret">Client secret</label>
                                <input id="client-secret" type="password" name="client_secret" class="form-control" autocomplete="new-password" spellcheck="false"
                                       @if(!$exists) required @endif placeholder="{{ $exists ? 'A secret is saved, enter a new one to replace it' : '' }}">
                                <p class="text-muted small">Stored encrypted, never shown again.</p>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="control-label" for="scopes">Scopes</label>
                            <input id="scopes" type="text" name="scopes" class="form-control" spellcheck="false" value="{{ old('scopes', $provider->scopes) }}" placeholder="{{ $endpoints['scopes'] }}">
                            <p class="text-muted small">What the panel asks for, separated by spaces. Leave empty for the default. It needs the email address and a way to tell accounts apart.</p>
                        </div>
                    </div>
                </div>

                @if($generic)
                    <div class="box">
                        <div class="box-header with-border"><h3 class="box-title">The service</h3></div>
                        <div class="box-body">
                            <div class="form-group">
                                <label class="control-label" for="authorize-url">Authorization address</label>
                                <input id="authorize-url" type="url" name="authorize_url" class="form-control" required spellcheck="false" value="{{ old('authorize_url', $endpoints['authorize_url']) }}">
                            </div>
                            <div class="form-group">
                                <label class="control-label" for="token-url">Token address</label>
                                <input id="token-url" type="url" name="token_url" class="form-control" required spellcheck="false" value="{{ old('token_url', $endpoints['token_url']) }}">
                            </div>
                            <div class="form-group">
                                <label class="control-label" for="userinfo-url">User info address</label>
                                <input id="userinfo-url" type="url" name="userinfo_url" class="form-control" required spellcheck="false" value="{{ old('userinfo_url', $endpoints['userinfo_url']) }}">
                                <p class="text-muted small">Answered with JSON about the person when asked with their access token.</p>
                            </div>
                            <div class="row">
                                @foreach(['id' => 'Unique id', 'email' => 'Email address', 'username' => 'Username', 'name' => 'Full name', 'email_verified' => 'Email checked'] as $field => $label)
                                    <div class="form-group col-md-4">
                                        <label class="control-label" for="map-{{ $field }}">{{ $label }}</label>
                                        <input id="map-{{ $field }}" type="text" name="map_{{ $field }}" class="form-control" spellcheck="false" value="{{ old('map_' . $field, $mapping[$field] ?? '') }}">
                                    </div>
                                @endforeach
                            </div>
                            <p class="text-muted small no-margin-bottom">The names of the fields in the answer (<code>a.b</code> for a field inside another). The id has to stay the same for a person forever, it is how they are recognised.</p>
                        </div>
                    </div>
                @endif
            </div>
            <div class="col-md-4">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Callback address</h3></div>
                    <div class="box-body">
                        <input type="text" class="form-control" readonly value="{{ $callback }}" onclick="this.select()">
                        <p class="text-muted small" style="margin-top: 6px;">Enter this as the redirect / callback address at the service. It has to match exactly.</p>
                    </div>
                </div>
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Who can use it</h3></div>
                    <div class="box-body">
                        <div class="checkbox checkbox-primary">
                            <input id="enabled" type="checkbox" name="enabled" value="1" @if(old('enabled', $provider->enabled)) checked @endif>
                            <label for="enabled">On: people can sign in and link it</label>
                        </div>
                        <div class="checkbox checkbox-primary">
                            <input id="allow-signup" type="checkbox" name="allow_signup" value="1" @if(old('allow_signup', $provider->allow_signup)) checked @endif>
                            <label for="allow-signup">People without an account can sign up with it (needs self sign up)</label>
                        </div>
                        <p class="text-muted small no-margin-bottom">An existing account is never found by its email address, people link a provider themselves under Account &rarr; Providers.</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="row">
            <div class="col-xs-12">
                <div class="box box-primary">
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        <input type="hidden" name="type" value="{{ $provider->type }}">
                        @if($exists)
                            <button type="submit" form="delete-provider" class="btn btn-sm btn-danger" onclick="return confirm('Remove {{ e($provider->name) }}? Accounts linked to it lose that way of signing in.')">Remove</button>
                            <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                        @else
                            <button type="submit" class="btn btn-sm btn-primary pull-right">Add</button>
                        @endif
                    </div>
                </div>
            </div>
        </div>
    </form>
    @if($exists)
        <form id="delete-provider" action="{{ route('admin.settings.providers.delete', $provider->id) }}" method="POST">
            {!! csrf_field() !!}
            {!! method_field('DELETE') !!}
        </form>
    @endif
@endsection

@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'domains'])

@section('title')
    {{ $exists ? $zone->domain : 'Add a domain' }}
@endsection

@section('content-header')
    <h1>{{ $exists ? $zone->domain : 'Add a domain' }}<small>{{ $type['name'] }}</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.settings.domains') }}">Domains</a></li>
        <li class="active">{{ $exists ? $zone->domain : 'New' }}</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    <form action="{{ $exists ? route('admin.settings.domains.edit', $zone->id) : route('admin.settings.domains.store') }}" method="POST" autocomplete="off">
        <div class="row">
            <div class="col-md-8">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">The domain</h3></div>
                    <div class="box-body">
                        <div class="row">
                            <div class="form-group col-md-6">
                                <label class="control-label" for="domain">Domain</label>
                                <input id="domain" type="text" name="domain" class="form-control" required spellcheck="false" placeholder="example.com"
                                       value="{{ old('domain', $zone->domain) }}" @if($exists) disabled @endif>
                                <p class="text-muted small">People take names under it: <code>play.{{ $zone->domain ?: 'example.com' }}</code>. {{ $exists ? 'It can not be changed.' : 'It can not be changed later.' }}</p>
                            </div>
                            <div class="form-group col-md-6">
                                <label class="control-label" for="name">Name for you</label>
                                <input id="name" type="text" name="name" class="form-control" required maxlength="60" value="{{ old('name', $zone->name) }}" placeholder="Main domain">
                            </div>
                        </div>
                        <div class="row">
                            <div class="form-group col-md-4">
                                <label class="control-label" for="ttl">TTL (seconds)</label>
                                <input id="ttl" type="number" name="ttl" class="form-control" required min="60" max="86400" value="{{ old('ttl', $zone->ttl) }}">
                                <p class="text-muted small">How long resolvers keep the record. Short means changes show sooner.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Access to {{ $type['name'] }}</h3></div>
                    <div class="box-body">
                        <p class="text-muted">{{ $type['help'] }}</p>
                        <div class="row">
                            @foreach($type['fields'] as $key => $field)
                                <div class="form-group col-md-6">
                                    <label class="control-label" for="cred-{{ $key }}">{{ $field['label'] }}</label>
                                    <input id="cred-{{ $key }}" type="{{ $field['secret'] ? 'password' : 'text' }}" name="credentials[{{ $key }}]" class="form-control" spellcheck="false"
                                           autocomplete="new-password" @if($field['required'] && !$exists) required @endif
                                           value="{{ $field['secret'] ? '' : old("credentials.$key", $credentials[$key] ?? '') }}"
                                           placeholder="{{ $field['secret'] && !empty($credentials[$key]) ? 'Saved. Enter a new one to replace it' : '' }}">
                                    <p class="text-muted small">{{ $field['help'] }}@if($field['secret']) Stored encrypted, never shown again.@endif</p>
                                </div>
                            @endforeach
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Offered to people</h3></div>
                    <div class="box-body">
                        <div class="checkbox checkbox-primary">
                            <input id="enabled" type="checkbox" name="enabled" value="1" @if(old('enabled', $zone->enabled)) checked @endif>
                            <label for="enabled">People can take a name under this domain</label>
                        </div>
                        <p class="text-muted small no-margin">The access is checked when you save. If it does not work the domain is switched off.</p>
                    </div>
                </div>
                @if($exists)
                    <div class="box">
                        <div class="box-header with-border"><h3 class="box-title">Check</h3></div>
                        <div class="box-body">
                            <button type="submit" formaction="{{ route('admin.settings.domains.test', $zone->id) }}" formmethod="POST" formnovalidate class="btn btn-sm btn-default">Test the access</button>
                            <p class="text-muted small" style="margin-top:8px;">{{ $count }} {{ $count === 1 ? 'name is' : 'names are' }} under this domain.</p>
                        </div>
                    </div>
                @endif
            </div>
        </div>
        <div class="row">
            <div class="col-xs-12">
                <div class="box box-primary">
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        <input type="hidden" name="type" value="{{ $zone->type }}">
                        @if($exists)
                            <button type="submit" form="delete-zone" class="btn btn-sm btn-danger" onclick="return confirm('Remove {{ e($zone->domain) }}? The {{ $count }} names under it and their DNS records are removed too.')">Remove</button>
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
        <form id="delete-zone" action="{{ route('admin.settings.domains.delete', $zone->id) }}" method="POST">
            {!! csrf_field() !!}
            {!! method_field('DELETE') !!}
        </form>
    @endif
@endsection

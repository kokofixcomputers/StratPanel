@extends('layouts.admin')

@section('title')
    {{ $manifest->name() }}
@endsection

@section('content-header')
    <h1>{{ $manifest->name() }}<small>{{ $manifest->description() }}</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.extensions') }}">Extensions</a></li>
        <li class="active">{{ $manifest->name() }}</li>
    </ol>
@endsection

@section('content')
    <form action="{{ route('admin.extensions.settings', $record->ext_id) }}" method="POST" autocomplete="off">
        <div class="row">
            <div class="col-md-8">
                <div class="box">
                    <div class="box-header with-border">
                        <h3 class="box-title">Settings</h3>
                    </div>
                    <div class="box-body">
                        @foreach($manifest->settings() as $setting)
                            @php($key = $setting['key'])
                            @php($name = 'settings[' . $key . ']')
                            @php($value = old('settings.' . $key, $current[$key] ?? ''))
                            <div class="form-group {{ $errors->has('settings.' . $key) ? 'has-error' : '' }}">
                                @if($setting['type'] === 'boolean')
                                    <div class="checkbox checkbox-primary no-margin-bottom">
                                        <input type="hidden" name="{{ $name }}" value="0">
                                        <input id="setting-{{ $key }}" type="checkbox" name="{{ $name }}" value="1" @if(filter_var($value, FILTER_VALIDATE_BOOLEAN)) checked @endif>
                                        <label for="setting-{{ $key }}">{{ $setting['label'] }}</label>
                                    </div>
                                @else
                                    <label class="control-label" for="setting-{{ $key }}">{{ $setting['label'] }}</label>
                                    @if($setting['type'] === 'textarea')
                                        <textarea id="setting-{{ $key }}" name="{{ $name }}" class="form-control" rows="{{ $setting['rows'] ?? 4 }}" placeholder="{{ $setting['placeholder'] ?? '' }}">{{ $value }}</textarea>
                                    @elseif($setting['type'] === 'select')
                                        <select id="setting-{{ $key }}" name="{{ $name }}" class="form-control">
                                            @foreach($options($setting) as $optionValue => $label)
                                                <option value="{{ $optionValue }}" @if((string) $value === (string) $optionValue) selected @endif>{{ $label }}</option>
                                            @endforeach
                                        </select>
                                    @elseif($setting['type'] === 'number')
                                        <input id="setting-{{ $key }}" type="number" name="{{ $name }}" class="form-control" value="{{ $value }}"
                                               @isset($setting['min']) min="{{ $setting['min'] }}" @endisset @isset($setting['max']) max="{{ $setting['max'] }}" @endisset step="any">
                                    @elseif($setting['type'] === 'password')
                                        <input id="setting-{{ $key }}" type="password" name="{{ $name }}" class="form-control" value=""
                                               placeholder="{{ ($current[$key] ?? '') !== '' ? 'A value is saved, type a new one to replace it' : ($setting['placeholder'] ?? '') }}" autocomplete="new-password">
                                    @else
                                        <input id="setting-{{ $key }}" type="text" name="{{ $name }}" class="form-control" value="{{ $value }}" placeholder="{{ $setting['placeholder'] ?? '' }}">
                                    @endif
                                @endif
                                @if(!empty($setting['help']))
                                    <p class="text-muted small" style="margin: 5px 0 0;">{{ $setting['help'] }}</p>
                                @endif
                                @if($errors->has('settings.' . $key))
                                    <p class="text-danger small" style="margin: 5px 0 0;">{{ $errors->first('settings.' . $key) }}</p>
                                @endif
                            </div>
                        @endforeach
                    </div>
                    <div class="box-footer">
                        {!! csrf_field() !!}
                        <a href="{{ route('admin.extensions') }}" class="btn btn-sm btn-default">Back</a>
                        <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">About</h3></div>
                    <div class="box-body">
                        <dl class="dl-horizontal small" style="margin: 0;">
                            <dt>Version</dt><dd>{{ $manifest->version() }}</dd>
                            @if($manifest->author() !== '')<dt>Author</dt><dd>{{ $manifest->author() }}</dd>@endif
                            @if($manifest->homepage())<dt>Website</dt><dd><a href="{{ $manifest->homepage() }}" target="_blank" rel="noopener noreferrer">{{ $manifest->homepage() }}</a></dd>@endif
                            <dt>Id</dt><dd><code>{{ $manifest->id() }}</code></dd>
                            <dt>State</dt><dd>{{ $record->enabled ? 'On' : 'Off' }}</dd>
                        </dl>
                    </div>
                </div>
            </div>
        </div>
    </form>
@endsection

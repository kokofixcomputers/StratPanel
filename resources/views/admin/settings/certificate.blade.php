@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'certificates'])

@section('title')
    {{ $certificate->name }}
@endsection

@section('content-header')
    <h1>{{ $certificate->name }}<small>A certificate for https.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li><a href="{{ route('admin.settings.certificates') }}">Certificates</a></li>
        <li class="active">{{ $certificate->name }}</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    @php($canChange = Auth::user()->hasPermission('settings.certificates.update'))
    <form action="{{ route('admin.settings.certificates.edit', $certificate->id) }}" method="POST" enctype="multipart/form-data" autocomplete="off">
        <div class="row">
            <div class="col-md-6">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Certificate</h3></div>
                    <div class="box-body">
                        <table class="table no-margin">
                            <tr><th style="width: 30%;">Covers</th><td>@foreach($certificate->domains as $domain)<code>{{ $domain }}</code> @endforeach</td></tr>
                            <tr><th>Issued by</th><td>{{ $certificate->issuer ?: 'unknown' }}</td></tr>
                            <tr><th>Valid from</th><td>{{ $certificate->not_before?->toDayDateTimeString() }}</td></tr>
                            <tr>
                                <th>Ends</th>
                                <td>
                                    {{ $certificate->not_after?->toDayDateTimeString() }}
                                    @if($certificate->isExpired())<span class="label label-danger">Expired</span>
                                    @elseif($certificate->isExpiring())<span class="label label-warning">{{ $certificate->daysLeft() }} days left</span>@endif
                                </td>
                            </tr>
                            <tr><th>Fingerprint</th><td><code class="small" style="word-break: break-all;">{{ $certificate->fingerprint }}</code></td></tr>
                        </table>
                    </div>
                </div>
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Settings</h3></div>
                    <div class="box-body">
                        <div class="form-group">
                            <label class="control-label" for="name">Name</label>
                            <input id="name" type="text" name="name" class="form-control" required maxlength="100" value="{{ old('name', $certificate->name) }}" @if(!$canChange) disabled @endif>
                        </div>
                        <div class="checkbox checkbox-primary">
                            <input id="enabled" type="checkbox" name="enabled" value="1" @if(old('enabled', $certificate->enabled)) checked @endif @if(!$canChange) disabled @endif>
                            <label for="enabled">On: panel-edge uses it</label>
                        </div>
                        <div class="checkbox checkbox-primary no-margin-bottom">
                            <input id="is_default" type="checkbox" name="is_default" value="1" @if(old('is_default', $certificate->is_default)) checked @endif @if(!$canChange) disabled @endif>
                            <label for="is_default">Default: used for names no certificate covers, and for the IP address</label>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                @if($canChange)
                    <div class="box">
                        <div class="box-header with-border"><h3 class="box-title">Renew</h3></div>
                        <div class="box-body">
                            <p class="text-muted small">When the certificate was renewed, add the new one here. It keeps its name, whether it is on and whether it is the default. Leave empty to change nothing.</p>
                            <div class="form-group">
                                <label class="control-label" for="certificate">New certificate</label>
                                <textarea id="certificate" name="certificate" rows="5" class="form-control" spellcheck="false">{{ old('certificate') }}</textarea>
                                <input type="file" name="certificate_file" class="small" style="margin-top: 4px;" accept=".pem,.crt,.cer,.txt">
                            </div>
                            <div class="form-group">
                                <label class="control-label" for="private_key">Private key</label>
                                <textarea id="private_key" name="private_key" rows="4" class="form-control" spellcheck="false" autocomplete="off"></textarea>
                                <input type="file" name="private_key_file" class="small" style="margin-top: 4px;" accept=".pem,.key,.txt">
                            </div>
                            <div class="form-group no-margin-bottom">
                                <label class="control-label" for="passphrase">Passphrase of the key</label>
                                <input id="passphrase" type="password" name="passphrase" class="form-control" autocomplete="new-password" placeholder="Only if the key has one">
                            </div>
                        </div>
                    </div>
                @endif
            </div>
        </div>
        @if($canChange)
            <div class="row">
                <div class="col-xs-12">
                    <div class="box box-primary">
                        <div class="box-footer">
                            {!! csrf_field() !!}
                            <button type="submit" form="delete-certificate" class="btn btn-sm btn-danger" onclick="return confirm('Delete {{ e($certificate->name) }}? Visitors of the names it covers get an error until another certificate covers them.')">Delete</button>
                            <button type="submit" name="_method" value="PATCH" class="btn btn-sm btn-primary pull-right">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        @endif
    </form>
    @if($canChange)
        <form id="delete-certificate" action="{{ route('admin.settings.certificates.delete', $certificate->id) }}" method="POST">
            {!! csrf_field() !!}
            {!! method_field('DELETE') !!}
        </form>
    @endif
@endsection

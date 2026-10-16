@extends('layouts.admin')
@include('partials/admin.settings.nav', ['activeTab' => 'trash'])

@section('title')
    Trash
@endsection

@section('content-header')
    <h1>Trash<small>Keep what is deleted from a server for a while, so it can be recovered.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Settings</li>
    </ol>
@endsection

@section('content')
    @yield('settings::nav')
    <form action="{{ route('admin.settings.trash') }}" method="POST">
        <div class="row">
            <div class="col-md-7">
                <div class="box">
                    <div class="box-header with-border"><h3 class="box-title">Trash bin</h3></div>
                    <div class="box-body">
                        <p class="text-muted">
                            Off by default. When it is on, files, folders and schedules that people delete from a server are moved to the trash bin of
                            that server instead of being deleted. People with the trash permissions of the server (owners always have them) see the
                            trash bin on the server's menu and can recover things from it. Nothing is overwritten when something is recovered.
                        </p>
                        <div class="checkbox checkbox-primary">
                            <input id="enabled" type="checkbox" name="enabled" value="1" @if(old('enabled', $enabled)) checked @endif>
                            <label for="enabled">Keep deleted files and schedules in a trash bin</label>
                        </div>
                        <div class="form-group" style="max-width: 220px;">
                            <label class="control-label" for="retention_days">Keep for (days)</label>
                            <input id="retention_days" type="number" name="retention_days" class="form-control" min="1" max="365" required value="{{ old('retention_days', $days) }}">
                            <p class="text-muted small">After this many days an item is deleted for good, the panel checks every hour. A change applies to what is deleted from now on.</p>
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
                            <li>Files stay on the node, in a hidden folder in the root of the server. They <strong>count toward the disk limit</strong> of the server until they are recovered, deleted or expire.</li>
                            <li>The panel never lets the file manager show or touch that folder.</li>
                            <li>Databases, backups and whole servers are not kept: they are deleted at once.</li>
                            <li>Turning this off keeps what is in the trash bins already, it is recoverable until it expires. Deleting is permanent again from then on.</li>
                            <li>Right now: <strong>{{ $items }}</strong> {{ $items === 1 ? 'item is' : 'items are' }} in trash bins@if($bytes > 0), at least <strong>{{ number_format($bytes / 1048576, 1) }} MB</strong> of files@endif.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </form>
@endsection

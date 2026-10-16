@extends('layouts.admin')

@section('title')
    Extensions
@endsection

@section('content-header')
    <h1>Extensions<small>Add features to Stratosphere, switch them on and off, and set them.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Extensions</li>
    </ol>
@endsection

@section('content')
    @if($safeMode)
        <div class="row">
            <div class="col-xs-12">
                <div class="alert alert-warning">
                    <i class="fa fa-shield"></i> The panel is in <strong>safe mode</strong> (<code>STRATOSPHERE_EXTENSIONS=false</code> in <code>.env</code>), no extension is started.
                    Set it to <code>true</code> to bring them back.
                </div>
            </div>
        </div>
    @endif

    <div class="row">
        <div class="col-xs-12">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Installed extensions</h3>
                </div>
                @if($items->isEmpty())
                    <div class="box-body">
                        <p class="text-muted" style="margin: 0;">No extensions are installed yet.</p>
                    </div>
                @else
                    <div class="box-body table-responsive no-padding">
                        <table class="table table-hover" id="extensions-table">
                            <tbody>
                            @foreach($items as $item)
                                @php($record = $item['record'])
                                @php($manifest = $item['manifest'])
                                <tr data-extension="{{ $record->ext_id }}">
                                    <td style="width: 38%;">
                                        <strong>{{ $record->name }}</strong>
                                        <span class="text-muted small">{{ $record->version }}</span>
                                        @if($manifest && $manifest->author() !== '')
                                            <span class="text-muted small">by {{ $manifest->author() }}</span>
                                        @endif
                                        <div class="text-muted small" style="margin-top: 3px;">{{ $manifest ? $manifest->description() : 'The files of this extension are missing or damaged, install it again.' }}</div>
                                        <code class="small">{{ $record->ext_id }}</code>
                                    </td>
                                    <td style="width: 14%;">
                                        @if(!$record->enabled)
                                            <span class="label label-default">Off</span>
                                        @elseif($item['failed'] || $record->last_error)
                                            <span class="label label-warning">On, with a problem</span>
                                        @elseif($item['running'])
                                            <span class="label label-success">On</span>
                                        @else
                                            <span class="label label-default">On, not started</span>
                                        @endif
                                    </td>
                                    <td>
                                        @if($record->last_error)
                                            <div class="callout callout-warning" style="margin: 0 0 8px; padding: 8px 12px;">
                                                <div class="small"><strong>The panel carried on without it.</strong>
                                                    @if($record->last_error_at) <span class="text-muted">{{ $record->last_error_at->diffForHumans() }}</span> @endif
                                                </div>
                                                <div class="small" style="word-break: break-word;"><code>{{ $record->last_error }}</code></div>
                                            </div>
                                        @endif
                                        <form action="{{ route('admin.extensions.toggle', $record->ext_id) }}" method="POST" style="display: inline;">
                                            {!! csrf_field() !!}
                                            <button type="submit" class="btn btn-xs {{ $record->enabled ? 'btn-default' : 'btn-success' }}">
                                                {{ $record->enabled ? 'Switch off' : 'Switch on' }}
                                            </button>
                                        </form>
                                        @if($item['hasSettings'])
                                            <a href="{{ route('admin.extensions.settings', $record->ext_id) }}" class="btn btn-xs btn-primary"><i class="fa fa-cog"></i> Settings</a>
                                        @endif
                                        @if($record->last_error)
                                            <form action="{{ route('admin.extensions.clear', $record->ext_id) }}" method="POST" style="display: inline;">
                                                {!! csrf_field() !!}
                                                <button type="submit" class="btn btn-xs btn-default">Dismiss the error</button>
                                            </form>
                                        @endif
                                    </td>
                                </tr>
                            @endforeach
                            </tbody>
                        </table>
                    </div>
                @endif
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col-xs-12">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Installing an extension</h3>
                </div>
                <div class="box-body">
                    <p>An extension is a <code>.stratext</code> file. On the machine that runs the panel:</p>
                    <pre style="margin-bottom: 10px;">php artisan p:extension:install path/to/extension.stratext</pre>
                    <p class="text-muted small" style="margin-bottom: 0;">
                        A new extension is off until you switch it on here. <strong>An extension is PHP and JavaScript that runs as a part of the panel, with the same
                        access to everything in it.</strong> Only install extensions from people you trust. One that breaks is left out and the panel carries on,
                        the problem is shown here. <code>php artisan p:extension:remove &lt;id&gt;</code> removes one, <code>p:extension:list</code> lists them.
                    </p>
                </div>
            </div>
        </div>
    </div>
@endsection

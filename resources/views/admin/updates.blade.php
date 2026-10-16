@extends('layouts.admin')

@section('title')
    Updates
@endsection

@section('content-header')
    <h1>Updates<small>The router, the edge and the Wings of the nodes.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Updates</li>
    </ol>
@endsection

@section('content')
<div class="row">
    <div class="col-md-7">
        <div class="box">
            <div class="box-header with-border">
                <h3 class="box-title">Panel, router and edge on this machine</h3>
            </div>
            <div class="box-body">
                <p class="text-muted">
                    <b>The panel</b> is updated with the same steps as <code>tools/update-panel.sh</code>: the current files are backed up, the panel goes
                    into maintenance mode, the archive is extracted over it, composer and the migrations run, caches are cleared, the queue worker
                    is restarted and the panel comes back. The router and the edge are updated after it. It takes a minute or two, this page
                    shows the maintenance screen meanwhile and comes back by itself.<br><br>
                    <b>The router</b> (<code>mc-router</code>: custom domains, sleeping servers) and <b>the edge</b> (<code>panel-edge</code>: https for the
                    panel) run as services next to the panel. Updating puts the newest build in place and restarts the service. If the new build
                    does not start, the previous one is put back.
                </p>
                @if (!$installed)
                    <div class="alert alert-warning">
                        The updater is not installed on this machine yet. Run this once in the folder of the panel, then reload:
                        <pre style="margin-top:10px;">sudo bash tools/updater/install.sh</pre>
                        It adds a small service that does nothing until this page asks, and then only does the two things below.
                    </div>
                @endif

                <div class="form-group">
                    <label class="control-label">Where to download from</label>
                    <div class="radio radio-primary">
                        <input id="channel-latest" type="radio" name="channel" value="latest" checked @if (!$installed) disabled @endif>
                        <label for="channel-latest">Latest release <span class="text-muted small"><code>{{ $tarUrl }}</code></span></label>
                    </div>
                    <div class="radio radio-primary">
                        <input id="channel-nightly" type="radio" name="channel" value="nightly" @if (!$installed) disabled @endif>
                        <label for="channel-nightly">Nightly build <span class="text-muted small"><code>{{ $tarNightlyUrl }}</code></span></label>
                    </div>
                    <p class="text-muted small">Updating the router and edge only takes their binaries out of panel.tar.gz and does not change the panel.</p>
                </div>

                <div id="update-state" class="text-muted small"></div>
                <table class="table table-hover" id="update-results" style="display:none; margin-top: 10px;">
                    <thead><tr><th>Service</th><th>Result</th><th>Details</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>
            <div class="box-footer" id="update-buttons">
                <button type="button" class="btn btn-sm btn-primary" data-action="panel" @if (!$installed) disabled @endif>
                    <i class="fa fa-refresh"></i> Update the panel
                </button>
                <button type="button" class="btn btn-sm btn-default" data-action="download" @if (!$installed) disabled @endif>
                    <i class="fa fa-cloud-download"></i> Update router and edge only
                </button>
                <button type="button" class="btn btn-sm btn-default" data-action="local" @if (!$installed) disabled @endif
                        title="Uses tools/mc-router/dist and tools/panel-edge/dist of the panel. They only count if they belong to root, not to the panel's user.">
                    <i class="fa fa-hdd-o"></i> Update from files on this machine
                </button>
            </div>
        </div>
    </div>
    <div class="col-md-5">
        <div class="box">
            <div class="box-header with-border">
                <h3 class="box-title">Wings on the nodes</h3>
            </div>
            <div class="box-body">
                <p class="text-muted no-margin-bottom">
                    Nodes download the newest Wings of Stratosphere themselves, check it and restart Wings. Servers keep running.
                    @if ($wingsLatest) The newest build is <code>{{ $wingsLatest }}</code>. @else The newest build could not be looked up right now. @endif
                </p>
            </div>
            <div class="box-footer">
                <a href="{{ route('admin.nodes') }}" class="btn btn-sm btn-default"><i class="fa fa-server"></i> Open the nodes ({{ $nodeCount }})</a>
            </div>
        </div>
        <div class="box">
            <div class="box-header with-border">
                <h3 class="box-title">About the files on this machine</h3>
            </div>
            <div class="box-body">
                <p class="text-muted no-margin-bottom">
                    The panel's own user owns the panel files, so a hacked panel could replace the binaries in <code>tools/*/dist</code>. The updater
                    therefore only uses them when they belong to root: <code>chown -R root: tools/mc-router/dist tools/panel-edge/dist</code> once.
                    The download does not have this limit.
                </p>
            </div>
        </div>
    </div>
</div>
@endsection

@section('footer-scripts')
    @parent
    <script>
    (function () {
        var token = '{{ csrf_token() }}';
        var $state = $('#update-state');
        var $table = $('#update-results');
        var asked = false;
        var before = {!! json_encode($status['finished_at'] ?? null) !!};
        var labels = { updated: 'Updated', current: 'Already current', missing: 'Not installed', failed: 'Failed' };

        function show(status) {
            if (!status || !status.finished_at) { return; }
            $table.show().find('tbody').empty();
            (status.results || []).forEach(function (r) {
                var cls = r.status === 'failed' ? 'danger' : (r.status === 'updated' ? 'success' : 'default');
                $('<tr>')
                    .append($('<td>').append($('<code>').text(r.name)))
                    .append($('<td>').append($('<span class="label label-' + cls + '">').text(labels[r.status] || r.status)))
                    .append($('<td>').text(r.detail || ''))
                    .appendTo($table.find('tbody'));
            });
            $state.text('Last run ' + status.finished_at + ' (' + status.action + ').');
        }

        function poll() {
            $.getJSON('{{ route('admin.updates.status') }}').done(function (d) {
                var running = d.pending || (d.status && d.status.running);
                var changed = d.status && d.status.finished_at && d.status.finished_at !== before;
                if (running || (asked && !changed)) {
                    $state.text('Working on it...');
                    setTimeout(poll, 2000);
                    return;
                }
                $('#update-buttons button').prop('disabled', {{ $installed ? 'false' : 'true' }});
                before = d.status ? d.status.finished_at : before;
                asked = false;
                show(d.status);
            }).fail(function () {
                // The panel is in maintenance mode (or restarting) while it updates: keep asking until it answers.
                if (asked) {
                    $state.text('The panel is updating, this page continues when it is back...');
                    setTimeout(poll, 3000);
                }
            });
        }

        function send(button) {
            $('#update-buttons button').prop('disabled', true);
            asked = true;
            $.ajax({ method: 'POST', url: '{{ route('admin.updates.run') }}', data: { action: button.data('action'), channel: $('input[name=channel]:checked').val() }, headers: { 'X-CSRF-TOKEN': token } })
                .done(function () { $state.text('Asked the updater...'); setTimeout(poll, 1500); })
                .fail(function (x) {
                    asked = false;
                    $('#update-buttons button').prop('disabled', false);
                    $state.text((x.responseJSON && x.responseJSON.error) || 'The request failed.');
                });
        }

        $('#update-buttons button').on('click', function () {
            var button = $(this);
            if (button.data('action') !== 'panel') { send(button); return; }
            swal({
                title: 'Update the panel?',
                text: 'The panel goes into maintenance mode for a minute or two, its files are backed up first. The router and the edge are updated after it.',
                type: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Update'
            }, function () { send(button); });
        });

        poll();
    })();
    </script>
@endsection

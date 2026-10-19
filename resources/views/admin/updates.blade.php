@extends('layouts.admin')

@section('title')
    Updates
@endsection

@section('content-header')
    <h1>Updates<small>Panel, router, edge and Wings.</small></h1>
    <ol class="breadcrumb">
        <li><a href="{{ route('admin.index') }}">Admin</a></li>
        <li class="active">Updates</li>
    </ol>
@endsection

@section('content')
@php
    $last = $status && isset($status['finished_at']) ? $status : null;
    $lastFailed = $last && collect($last['results'] ?? [])->contains(fn ($r) => ($r['status'] ?? '') === 'failed');
    $backupBytes = collect($backups ?? [])->sum('size');
@endphp
<div class="row stat-row">
    <div class="col-xs-6 col-md-3">
        <div class="stat-card {{ $installed ? 'stat-green' : 'stat-amber' }}">
            <span class="stat-icon"><i class="fa fa-{{ $installed ? 'check' : 'exclamation' }}"></i></span>
            <span class="stat-number stat-text">{{ $installed ? 'Ready' : 'Not installed' }}</span>
            <span class="stat-label">Updater</span>
            <span class="stat-sub">{{ $installed ? 'Runs when you ask it to' : 'One command to set up' }}</span>
        </div>
    </div>
    <div class="col-xs-6 col-md-3">
        <div class="stat-card {{ !$last ? 'stat-indigo' : ($lastFailed ? 'stat-pink' : 'stat-green') }}" id="card-last">
            <span class="stat-icon"><i class="fa fa-history"></i></span>
            <span class="stat-number stat-text" id="last-result">{{ !$last ? 'Never' : ($lastFailed ? 'Failed' : 'Done') }}</span>
            <span class="stat-label">Last run</span>
            <span class="stat-sub" id="last-when">{{ $last ? \Carbon\Carbon::parse($last['finished_at'])->diffForHumans() : 'Nothing yet' }}</span>
        </div>
    </div>
    <div class="col-xs-6 col-md-3">
        <a href="{{ route('admin.nodes') }}" class="stat-card stat-indigo">
            <span class="stat-icon"><i class="fa fa-sitemap"></i></span>
            <span class="stat-number stat-text" style="font-size:16px;line-height:1.3;padding-top:8px;word-break:break-all;">{{ $wingsLatest ?: 'Unknown' }}</span>
            <span class="stat-label">Newest Wings</span>
            <span class="stat-sub">Update the {{ $nodeCount }} {{ $nodeCount === 1 ? 'node' : 'nodes' }} from their page</span>
        </a>
    </div>
    <div class="col-xs-6 col-md-3">
        <div class="stat-card stat-pink">
            <span class="stat-icon"><i class="fa fa-archive"></i></span>
            <span class="stat-number" id="card-backups">{{ is_null($backups) ? '–' : count($backups) }}</span>
            <span class="stat-label">Backups</span>
            <span class="stat-sub" id="card-backups-sub">{{ is_null($backups) ? 'Looking...' : ($backupBytes ? number_format($backupBytes / 1048576, 1) . ' MB on disk' : 'Made before each update') }}</span>
        </div>
    </div>
</div>

<div class="row">
    <div class="col-md-7">
        <div class="box">
            <div class="box-header with-border">
                <h3 class="box-title">Update this machine</h3>
            </div>
            <div class="box-body">
                @if (!$installed)
                    <div class="alert alert-warning">
                        Install the updater once, then reload:
                        <pre style="margin-top:10px;">sudo bash tools/updater/install.sh</pre>
                    </div>
                @endif

                <div class="up-channel" role="radiogroup" aria-label="Where to download from">
                    <label class="up-pill">
                        <input type="radio" name="channel" value="latest" checked @if (!$installed) disabled @endif>
                        <span><i class="fa fa-tag"></i> Latest release</span>
                    </label>
                    <label class="up-pill">
                        <input type="radio" name="channel" value="nightly" @if (!$installed) disabled @endif>
                        <span><i class="fa fa-moon-o"></i> Nightly</span>
                    </label>
                </div>
                <p class="ov-sub" style="margin-top:8px;word-break:break-all;"><code id="channel-url" style="white-space:normal;">{{ $tarUrl }}</code></p>

                <div class="up-progress" id="up-progress" style="display:none;">
                    <div class="up-head">
                        <span class="up-title" id="up-title"></span>
                        <span class="ov-sub" id="up-note"></span>
                    </div>
                    <div class="up-bar" id="up-bar"><span id="up-fill"></span></div>
                    <ol class="up-steps" id="up-steps"></ol>
                    <ul class="up-results" id="up-results"></ul>
                </div>

                <details class="up-more">
                    <summary>How it works</summary>
                    <p class="text-muted small">
                        <b>Panel:</b> backup, maintenance mode, new files, composer and migrations, caches, back online. The page goes dark for a minute or two and comes back by itself.
                        <b>Router</b> and <b>edge</b> are swapped for the newest build and restarted; a build that does not start is rolled back.
                        <b>From this machine</b> uses <code>tools/*/dist</code> and only counts when root owns it (<code>chown -R root: tools/mc-router/dist tools/panel-edge/dist</code>).
                    </p>
                </details>
            </div>
            <div class="box-footer" id="update-buttons">
                <button type="button" class="btn btn-sm btn-primary" data-action="panel" @if (!$installed) disabled @endif>
                    <i class="fa fa-refresh"></i> Update the panel
                </button>
                <button type="button" class="btn btn-sm btn-default" data-action="download" @if (!$installed) disabled @endif title="Only the router and the edge, the panel stays as it is.">
                    <i class="fa fa-cloud-download"></i> Router and edge
                </button>
                <button type="button" class="btn btn-sm btn-default" data-action="local" @if (!$installed) disabled @endif title="Uses tools/mc-router/dist and tools/panel-edge/dist of this machine.">
                    <i class="fa fa-hdd-o"></i> From local files
                </button>
            </div>
        </div>
    </div>
    <div class="col-md-5">
        <div class="box">
            <div class="box-header with-border">
                <h3 class="box-title">Backups</h3>
                <div class="box-tools"><button type="button" class="btn btn-default btn-xs" id="backups-refresh" title="Look again" @if (!$installed) disabled @endif><i class="fa fa-refresh"></i></button></div>
            </div>
            <div class="box-body no-padding" id="backups-list"></div>
        </div>
    </div>
</div>
@endsection

@section('footer-scripts')
    @parent
    <script>
    (function () {
        var token = '{{ csrf_token() }}';
        var installed = {{ $installed ? 'true' : 'false' }};
        var urls = { latest: {!! json_encode($tarUrl) !!}, nightly: {!! json_encode($tarNightlyUrl) !!} };
        var asked = false;
        var wentDark = false;
        var before = {!! json_encode($status['finished_at'] ?? null) !!};
        var backups = {!! json_encode($backups) !!};
        var lastAction = null;

        // The steps of each kind of work, in order; the updater says which one it is at.
        var STEPS = {
            panel: [['download', 'Download', 'cloud-download'], ['backup', 'Backup', 'archive'], ['install', 'New files', 'file-o'], ['migrate', 'Database', 'database'], ['finish', 'Restart', 'power-off'], ['tools', 'Router, edge', 'exchange']],
            download: [['download', 'Download', 'cloud-download'], ['tools', 'Router, edge', 'exchange']],
            local: [['tools', 'Router, edge', 'exchange']],
            restore: [['backup', 'Save current', 'archive'], ['install', 'Restore files', 'file-o'], ['finish', 'Restart', 'power-off']],
            'delete-backup': [['x', 'Delete', 'trash']],
            backups: []
        };
        var TITLES = { panel: 'Updating the panel', download: 'Updating router and edge', local: 'Updating router and edge', restore: 'Restoring a backup', 'delete-backup': 'Deleting a backup' };
        var labels = { updated: ['check', 'success'], current: ['check', 'default'], missing: ['minus', 'default'], failed: ['times', 'danger'] };

        function kind(action) { return String(action || '').replace(/-nightly$/, ''); }
        function bytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
        function when(sec) { return new Date(sec * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }

        function renderBackups() {
            var $list = $('#backups-list').empty();
            if (backups === null) {
                $list.append('<div class="ov-empty"><i class="fa fa-spinner fa-spin"></i>Looking for backups...</div>');
                return;
            }
            $('#card-backups').text(backups.length);
            var total = backups.reduce(function (a, b) { return a + b.size; }, 0);
            $('#card-backups-sub').text(total ? (total / 1048576).toFixed(1) + ' MB on disk' : 'Made before each update');
            if (!backups.length) {
                $list.append('<div class="ov-empty"><i class="fa fa-archive"></i>No backups yet. One is made before every update.</div>');
                return;
            }
            var $ul = $('<ul class="ov-list" style="list-style:none;margin:0;">').appendTo($list);
            backups.forEach(function (b, i) {
                var before = /-before\.tar\.gz$/.test(b.name);
                var $row = $('<li class="up-backup">');
                $('<div class="up-backup-main">')
                    .append($('<div class="ov-item-main">').text(when(b.created)).append(i === 0 ? ' <span class="label label-primary">Newest</span>' : '').append(before ? ' <span class="label label-default">Before a restore</span>' : ''))
                    .append($('<div class="ov-sub">').text(bytes(b.size)))
                    .appendTo($row);
                $('<div class="up-backup-actions">')
                    .append($('<button type="button" class="btn btn-xs btn-default" title="Put these files back">').html('<i class="fa fa-undo"></i> Restore').prop('disabled', !installed || asked).on('click', function () { restore(b); }))
                    .append($('<button type="button" class="btn btn-xs btn-default" title="Delete this backup">').html('<i class="fa fa-trash"></i>').prop('disabled', !installed || asked).on('click', function () { remove(b); }))
                    .appendTo($row);
                $ul.append($row);
            });
        }

        function renderProgress(action, step, state, results) {
            var key = kind(action);
            var steps = STEPS[key] || [];
            if (!steps.length && state !== 'done') { return; }
            var $p = $('#up-progress').show();
            $('#up-title').text(TITLES[key] || 'Working');
            var idx = steps.findIndex(function (s) { return s[0] === step; });
            if (state === 'waiting') { idx = -1; }
            var pct = state === 'done' ? 100 : Math.max(4, Math.round(((idx + 0.5) / Math.max(1, steps.length)) * 100));
            var failed = (results || []).some(function (r) { return r.status === 'failed'; });
            $('#up-bar').toggleClass('up-working', state === 'working' || state === 'waiting').toggleClass('up-failed', state === 'done' && failed).toggleClass('up-done', state === 'done' && !failed);
            $('#up-fill').css('width', pct + '%');
            $('#up-note').text(state === 'dark' ? 'The panel is restarting, this page continues when it is back...' : (state === 'waiting' ? 'Waiting for the updater...' : ''));
            var $s = $('#up-steps').empty().toggle(steps.length > 1);
            steps.forEach(function (s, i) {
                var cls = state === 'done' ? (failed && i >= Math.max(0, idx) && idx >= 0 ? 'up-step-failed' : 'up-step-done') : (i < idx ? 'up-step-done' : (i === idx ? 'up-step-now' : ''));
                var icon = cls === 'up-step-done' ? 'check' : (cls === 'up-step-failed' ? 'times' : (cls === 'up-step-now' ? 'circle-o-notch fa-spin' : s[2]));
                $s.append($('<li>').addClass(cls).html('<i class="fa fa-' + icon + '"></i>').append($('<span>').text(s[1])));
            });
            var $r = $('#up-results').empty();
            (results || []).forEach(function (r) {
                var l = labels[r.status] || ['info', 'default'];
                $('<li>').addClass('up-r-' + l[1])
                    .append($('<i class="fa fa-' + l[0] + '">'))
                    .append($('<b>').text(r.name))
                    .append($('<span>').text(r.detail || ({ updated: 'Updated', current: 'Already current', missing: 'Not installed' }[r.status] || r.status)))
                    .appendTo($r);
            });
        }

        function showLast(status) {
            if (!status || !status.finished_at) { return; }
            var failed = (status.results || []).some(function (r) { return r.status === 'failed'; });
            $('#last-result').text(failed ? 'Failed' : 'Done');
            $('#card-last').removeClass('stat-indigo stat-green stat-pink').addClass(failed ? 'stat-pink' : 'stat-green');
            $('#last-when').text('Just now');
            if (kind(status.action) !== 'backups') { renderProgress(status.action, null, 'done', status.results); }
        }

        function buttons(disabled) { $('#update-buttons button').prop('disabled', disabled || !installed); renderBackups(); }

        function poll() {
            $.getJSON('{{ route('admin.updates.status') }}').done(function (d) {
                if (d.backups) { backups = d.backups; }
                var s = d.status;
                var running = d.pending || (s && s.running);
                var changed = s && s.finished_at && s.finished_at !== before;
                if (running || (asked && !changed)) {
                    lastAction = (s && s.action) || lastAction;
                    renderProgress(lastAction, s && s.step, d.pending || !s || !s.running ? 'waiting' : 'working');
                    renderBackups();
                    setTimeout(poll, 1500);
                    return;
                }
                before = s ? s.finished_at : before;
                asked = false;
                buttons(false);
                showLast(s);
            }).fail(function () {
                // The panel is in maintenance mode (or restarting) while it updates: keep asking until it answers.
                if (asked) {
                    wentDark = true;
                    renderProgress(lastAction, 'install', 'dark');
                    setTimeout(poll, 3000);
                }
            });
        }

        function send(data) {
            buttons(true);
            asked = true;
            lastAction = data.action;
            renderProgress(data.action, null, 'waiting');
            $.ajax({ method: 'POST', url: '{{ route('admin.updates.run') }}', data: data, headers: { 'X-CSRF-TOKEN': token } })
                .done(function () { setTimeout(poll, 1200); })
                .fail(function (x) {
                    asked = false;
                    buttons(false);
                    $('#up-progress').show();
                    $('#up-title').text('Could not start');
                    $('#up-bar').removeClass('up-working').addClass('up-failed');
                    $('#up-fill').css('width', '100%');
                    $('#up-steps').hide();
                    $('#up-note').text((x.responseJSON && x.responseJSON.error) || 'The request failed.');
                });
        }

        function restore(b) {
            swal({
                title: 'Restore this backup?',
                text: when(b.created) + '. The panel files go back to this state and the panel restarts. The database is not changed. Today\'s files are saved first.',
                type: 'warning', showCancelButton: true, confirmButtonText: 'Restore'
            }, function () { send({ action: 'restore', backup: b.name }); });
        }

        function remove(b) {
            swal({ title: 'Delete this backup?', text: when(b.created) + ' (' + bytes(b.size) + ')', type: 'warning', showCancelButton: true, confirmButtonText: 'Delete' },
                function () { send({ action: 'delete-backup', backup: b.name }); });
        }

        $('input[name=channel]').on('change', function () { $('#channel-url').text(urls[$('input[name=channel]:checked').val()]); });
        $('#backups-refresh').on('click', function () { send({ action: 'backups' }); });

        $('#update-buttons button').on('click', function () {
            var action = $(this).data('action');
            var data = { action: action, channel: $('input[name=channel]:checked').val() };
            if (action !== 'panel') { send(data); return; }
            swal({
                title: 'Update the panel?',
                text: 'It goes into maintenance mode for a minute or two. A backup is made first.',
                type: 'warning', showCancelButton: true, confirmButtonText: 'Update'
            }, function () { send(data); });
        });

        renderBackups();
        poll();
        // The list of backups is written by the updater: ask for it once when it is not there yet.
        if (installed && backups === null) {
            $.ajax({ method: 'POST', url: '{{ route('admin.updates.run') }}', data: { action: 'backups' }, headers: { 'X-CSRF-TOKEN': token } });
            var tries = 0;
            (function look() {
                $.getJSON('{{ route('admin.updates.status') }}').done(function (d) {
                    if (d.backups) { backups = d.backups; renderBackups(); return; }
                    if (++tries < 15 && !asked) { setTimeout(look, 2000); } else if (!asked) { backups = []; renderBackups(); }
                });
            })();
        }
    })();
    </script>
@endsection

@php($uiUpdate = app(\Pterodactyl\Services\Updates\UiUpdateChecker::class)->available())
@if ($uiUpdate)
    <div class="alert alert-info" id="ui-update-notice" role="alert" style="display:none;">
        <strong>Hey! An update is available.</strong>
        A newer web interface ({{ $uiUpdate['name'] ?: $uiUpdate['tag'] }}) was published{{ $uiUpdate['published'] ? ' on ' . \Carbon\Carbon::parse($uiUpdate['published'])->toFormattedDateString() : '' }}.
        Run this on the server to install it, then hard refresh the browser:
        <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
            <code id="ui-update-command" style="flex:1 1 320px;padding:6px 10px;word-break:break-all;">{{ $uiUpdate['command'] }}</code>
            <button type="button" class="btn btn-default btn-sm" id="ui-update-copy"><i class="fa fa-clipboard"></i> Copy</button>
            <button type="button" class="btn btn-link btn-sm" id="ui-update-dismiss">Hide until the next update</button>
        </div>
        <p class="small" style="margin:8px 0 0;opacity:.8;">
            Only the interface is replaced, the previous one is kept and <code>php artisan p:update-ui --rollback</code> puts it back.
            Changes that need a database migration need the full update, see the README.
        </p>
    </div>
    <script>
        (function () {
            var notice = document.getElementById('ui-update-notice');
            // What was hidden is remembered per build, the next one shows the notice again.
            var key = 'stratpanel:ui-update-hidden';
            var build = @json($uiUpdate['tag'] . '|' . $uiUpdate['published']);
            var hidden = null;
            try { hidden = window.localStorage.getItem(key); } catch (e) {}
            if (hidden !== build) notice.style.display = '';

            document.getElementById('ui-update-dismiss').addEventListener('click', function () {
                notice.style.display = 'none';
                try { window.localStorage.setItem(key, build); } catch (e) {}
            });

            document.getElementById('ui-update-copy').addEventListener('click', function () {
                var button = this;
                var text = document.getElementById('ui-update-command').textContent;
                var done = function () {
                    button.innerHTML = '<i class="fa fa-check"></i> Copied';
                    setTimeout(function () { button.innerHTML = '<i class="fa fa-clipboard"></i> Copy'; }, 1500);
                };

                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(text).then(done);
                    return;
                }
                // The panel may be opened over plain http, where the clipboard api is not there.
                var area = document.createElement('textarea');
                area.value = text;
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.appendChild(area);
                area.select();
                try { document.execCommand('copy'); done(); } catch (e) {}
                document.body.removeChild(area);
            });
        })();
    </script>
@endif

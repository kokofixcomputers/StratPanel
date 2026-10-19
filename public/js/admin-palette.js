/*
 * The search box of the admin pages: jump to admin pages and actions, to servers, and start, stop or restart a server by name.
 * The same list and the same matching as the one of the dashboard (resources/scripts/lib/palette.ts); admin-palette.spec.ts holds the two
 * together. The admin pages are not part of the React app, so this is plain JavaScript with no libraries.
 */
(function (root, factory) {
    var core = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = core;
    } else {
        root.StratPaletteCore = core;
        if (root.document && root.StratPalette) {
            root.document.addEventListener('DOMContentLoaded', function () { core.mount(root); });
        }
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    var GROUP_ORDER = ['Suggested', 'This server', 'Servers', 'Go to', 'Admin', 'Account'];

    function isWordStart(text, at) { return at === 0 || !/[a-z0-9]/.test(text.charAt(at - 1)); }

    function subsequence(text, token) {
        var at = 0;
        for (var i = 0; i < text.length; i++) {
            if (text.charAt(i) === token.charAt(at) && ++at === token.length) { return true; }
        }
        return false;
    }

    function tokenScore(token, label, words) {
        var at = label.indexOf(token);
        if (at === 0) { return 100; }
        if (at > 0) { return isWordStart(label, at) ? 70 : 40; }
        if (words.indexOf(token) >= 0) { return 25; }
        if (token.length >= 3 && subsequence(label, token)) { return 10; }
        return 0;
    }

    function scoreItem(item, query) {
        if (item.always) { return 1000; }
        var tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) { return 1; }
        var label = item.label.toLowerCase();
        var words = ((item.words || '') + ' ' + item.group + ' ' + (item.hint || '')).toLowerCase();
        var total = 0;
        for (var i = 0; i < tokens.length; i++) {
            var score = tokenScore(tokens[i], label, words);
            if (score === 0) { return 0; }
            total += score;
        }
        return total + (label.indexOf(query.trim().toLowerCase()) === 0 ? 50 : 0);
    }

    function order(group) {
        var at = GROUP_ORDER.indexOf(group);
        return at < 0 ? GROUP_ORDER.length : at;
    }

    function rankItems(items, query) {
        var typed = query.trim() !== '';
        var sections = {};
        var names = [];
        items.forEach(function (item, index) {
            var score = scoreItem(item, query);
            if (score === 0) { return; }
            if (!sections[item.group]) { sections[item.group] = { items: [], best: 0 }; names.push(item.group); }
            sections[item.group].items.push({ item: item, score: score, index: index });
            sections[item.group].best = Math.max(sections[item.group].best, score);
        });
        names.sort(function (a, b) {
            return typed ? (sections[b].best - sections[a].best) || (order(a) - order(b)) : order(a) - order(b);
        });
        return names.map(function (group) {
            var entries = sections[group].items.sort(function (a, b) { return (typed ? b.score - a.score : 0) || a.index - b.index; });
            var limit = group === 'Servers' ? 6 : (group === 'Suggested' ? 4 : (typed ? 8 : 6));
            return { group: group, items: entries.slice(0, limit).map(function (e) { return e.item; }) };
        });
    }

    var VERBS = { start: 'start', restart: 'restart', stop: 'stop', kill: 'stop' };

    function verbItems(query, servers, power) {
        var match = /^(start|restart|stop|kill)\s+(.+)$/i.exec(query.trim());
        if (!match) { return []; }
        var verb = match[1].toLowerCase();
        var words = match[2].toLowerCase().split(/\s+/).filter(Boolean);
        return servers.filter(function (s) {
            return s.canControl[VERBS[verb]] && words.every(function (w) { return (s.name + ' ' + s.node).toLowerCase().indexOf(w) >= 0; });
        }).slice(0, 5).map(function (s) {
            return {
                id: 'verb:' + verb + ':' + s.uuid, label: verb.charAt(0).toUpperCase() + verb.slice(1) + ' ' + s.name, hint: 'Power', group: 'Servers',
                words: verb + ' ' + s.name, icon: verb === 'start' ? 'play' : (verb === 'restart' ? 'refresh' : 'stop'),
                run: function () { return power(s.uuid, verb).then(function () { return verb.charAt(0).toUpperCase() + verb.slice(1) + ' sent to ' + s.name; }); }
            };
        });
    }

    /* ---- the box itself ---------------------------------------------------------------------------------------------- */

    function mount(win) {
        var doc = win.document;
        var config = win.StratPalette;
        var trigger = doc.getElementById('admin-search');
        var state = { open: false, query: '', active: 0, servers: null, remote: [], loading: false };
        var overlay, input, list, toastTimer, remoteTimer;

        function cookie(name) {
            var m = doc.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : '';
        }

        function power(uuid, verb) {
            return win.fetch('/api/client/servers/' + uuid + '/power', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': cookie('XSRF-TOKEN'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ signal: verb })
            }).then(function (r) { if (!r.ok) { throw new Error('The server did not accept that (' + r.status + ').'); } });
        }

        function post(path, body, what) {
            return win.fetch(path, {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': cookie('XSRF-TOKEN'), 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).then(function (r) { if (!r.ok) { throw new Error('The panel did not accept that (' + r.status + ').'); } });
        }

        /** What was typed, understood as a sentence ("restart my survival server", "create a backup called weekly for lobby"). */
        function sentenceItems(query, servers) {
            var nlu = win.StratNlu;
            if (!nlu || query.trim().length < 3) { return []; }
            var r = nlu.interpret(query, { servers: servers, current: null });
            if (!r) { return []; }
            var out = [];
            function add(id, label, icon, extra) {
                var item = { id: 'nl:' + id, label: label, hint: 'Understood', group: 'Suggested', icon: icon, always: true };
                for (var k in extra) { item[k] = extra[k]; }
                out.push(item);
            }
            var verbs = { start: ['Start', 'play'], restart: ['Restart', 'refresh'], stop: ['Stop', 'stop'], kill: ['Kill', 'bolt'] };
            r.servers.forEach(function (s) {
                if (verbs[r.intent]) {
                    var control = r.intent === 'kill' ? 'stop' : r.intent;
                    if (!s.canControl[control]) { return; }
                    add(r.intent + ':' + s.uuid, verbs[r.intent][0] + ' ' + s.name, verbs[r.intent][1], {
                        run: function () { return power(s.uuid, r.signal).then(function () { return verbs[r.intent][0] + ' sent to ' + s.name; }); }
                    });
                } else if (r.intent === 'backup') {
                    var name = r.backupName || '';
                    add('backup:' + s.uuid, name ? 'Back up ' + s.name + ' as \u201c' + name + '\u201d' : 'Back up ' + s.name, 'archive', {
                        run: function () { return post('/api/client/servers/' + s.uuid + '/backups', { name: name || undefined, is_locked: false }).then(function () { return 'Backup of ' + s.name + ' started'; }); }
                    });
                } else if (r.intent === 'command') {
                    add('command:' + s.uuid, 'Run \u201c' + r.command + '\u201d on ' + s.name, 'terminal', {
                        run: function () { return post('/api/client/servers/' + s.uuid + '/command', { command: r.command }).then(function () { return 'Sent \u201c' + r.command + '\u201d to ' + s.name; }); }
                    });
                } else if (r.intent === 'page') {
                    add('page:' + s.uuid, 'Open ' + r.page.name + ' of ' + s.name, 'th-list', { href: '/server/' + s.id + (r.page.path === '/' ? '' : r.page.path) });
                } else if (r.intent === 'open') {
                    add('open:' + s.uuid, 'Open ' + s.name, 'server', { href: '/server/' + s.id });
                }
            });
            if (r.intent === 'site') { add('site', 'Open ' + r.site.name, 'user', { href: r.site.path }); }
            return out;
        }

        function toServer(datum) {
            var a = datum.attributes;
            var alloc = ((a.relationships && a.relationships.allocations && a.relationships.allocations.data) || []).filter(function (x) { return x.attributes.is_default; })[0];
            return {
                id: a.identifier, uuid: a.uuid, name: a.name, node: a.node, internalId: a.internal_id, description: a.description || '',
                address: alloc ? (alloc.attributes.ip_alias || alloc.attributes.ip) + ':' + alloc.attributes.port : '',
                canControl: { start: !!(a.can_control && a.can_control.start), stop: !!(a.can_control && a.can_control.stop), restart: !!(a.can_control && a.can_control.restart) }
            };
        }

        function get(path) {
            return win.fetch(path, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
                .then(function (r) { return r.ok ? r.json() : { data: [] }; }).catch(function () { return { data: [] }; });
        }

        function loadServers() {
            if (state.servers !== null || state.loading) { return; }
            state.loading = true;
            get('/api/client?per_page=100').then(function (json) {
                state.servers = (json.data || []).map(toServer);
                state.loading = false;
                render();
            });
        }

        function searchRemote() {
            win.clearTimeout(remoteTimer);
            var term = state.query.trim();
            if (term.length < 2) { state.remote = []; return; }
            remoteTimer = win.setTimeout(function () {
                get('/api/client?type=admin-all&per_page=8&filter%5B*%5D=' + encodeURIComponent(term)).then(function (json) {
                    if (state.query.trim() !== term) { return; }
                    state.remote = (json.data || []).map(toServer);
                    render();
                });
            }, 250);
        }

        function build() {
            var items = [];
            var servers = (state.servers || []).slice();
            var known = {};
            servers.forEach(function (s) { known[s.uuid] = true; });
            state.remote.forEach(function (s) { if (!known[s.uuid]) { servers.push(s); } });
            var typed = state.query.trim() !== '';

            var sentence = sentenceItems(state.query, servers);
            items = items.concat(sentence);
            // "restart lobby" is already there as a sentence.
            items = items.concat(verbItems(state.query, servers, power).filter(function (v) {
                return !sentence.some(function (n) { return n.label === v.label; });
            }));
            servers.forEach(function (s) {
                var words = s.address + ' ' + s.node + ' ' + s.description;
                items.push({ id: 'server-admin:' + s.uuid, label: s.name + ': admin page', hint: 'Admin', group: 'Servers', words: words, icon: 'cog', href: '/admin/servers/view/' + s.internalId });
                if (typed) {
                    items.push({ id: 'server:' + s.uuid, label: s.name, hint: 'Open the server', group: 'Servers', words: words, icon: 'server', href: '/server/' + s.id });
                }
            });
            items.push(
                { id: 'go:home', label: 'Dashboard', hint: 'Your servers', group: 'Go to', words: 'home servers list', icon: 'th-large', href: '/' },
                { id: 'go:account', label: 'Account settings', group: 'Account', words: 'profile email password two factor 2fa', icon: 'user', href: '/account' },
                { id: 'go:api', label: 'API credentials', group: 'Account', words: 'keys token', icon: 'user', href: '/account/api' },
                { id: 'go:ssh', label: 'SSH keys', group: 'Account', words: 'sftp public key', icon: 'user', href: '/account/ssh' }
            );
            (config.admin || []).forEach(function (e) {
                items.push({ id: e.id, label: e.label, hint: e.kind === 'action' ? 'Admin action' : 'Admin', group: 'Admin', words: e.words, icon: e.kind === 'action' ? 'plus-circle' : 'sliders', href: e.url });
            });
            return items;
        }

        function el(tag, className, text) {
            var node = doc.createElement(tag);
            if (className) { node.className = className; }
            if (text !== undefined) { node.textContent = text; }
            return node;
        }

        function toast(text, error) {
            var old = doc.getElementById('pal-toast');
            if (old) { old.parentNode.removeChild(old); }
            win.clearTimeout(toastTimer);
            var t = el('div', 'pal-toast' + (error ? ' pal-toast-error' : ''), text);
            t.id = 'pal-toast';
            t.setAttribute('role', 'status');
            doc.body.appendChild(t);
            toastTimer = win.setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, error ? 6000 : 3500);
        }

        function choose(item) {
            if (!item) { return; }
            close();
            if (item.href) { win.location.assign(item.href); return; }
            toast(item.label + '...');
            item.run().then(function (text) { toast(text || 'Done'); }, function (e) { toast(e.message || 'That did not work.', true); });
        }

        function flat(sections) { return sections.reduce(function (all, s) { return all.concat(s.items); }, []); }

        function render() {
            if (!state.open) { return; }
            var sections = rankItems(build(), state.query);
            var items = flat(sections);
            if (state.active >= items.length) { state.active = Math.max(0, items.length - 1); }
            list.textContent = '';
            if (!items.length) {
                list.appendChild(el('p', 'pal-empty', state.loading ? 'Loading...' : 'Nothing found.'));
                return;
            }
            var index = -1;
            sections.forEach(function (section) {
                var box = el('div', 'pal-section');
                box.appendChild(el('p', 'pal-heading', section.group));
                section.items.forEach(function (item) {
                    index += 1;
                    var mine = index;
                    var row = el('div', 'pal-row' + (mine === state.active ? ' pal-active' : ''));
                    row.setAttribute('role', 'option');
                    row.setAttribute('aria-selected', mine === state.active ? 'true' : 'false');
                    var icon = el('i', 'fa fa-' + item.icon);
                    row.appendChild(icon);
                    row.appendChild(el('span', 'pal-label', item.label));
                    if (item.hint) { row.appendChild(el('span', 'pal-hint', item.hint)); }
                    row.addEventListener('mousemove', function () { if (state.active !== mine) { state.active = mine; markActive(); } });
                    row.addEventListener('click', function () { choose(item); });
                    box.appendChild(row);
                });
                list.appendChild(box);
            });
        }

        function markActive() {
            var rows = list.querySelectorAll('.pal-row');
            for (var i = 0; i < rows.length; i++) {
                rows[i].className = 'pal-row' + (i === state.active ? ' pal-active' : '');
                rows[i].setAttribute('aria-selected', i === state.active ? 'true' : 'false');
                if (i === state.active && rows[i].scrollIntoView) { rows[i].scrollIntoView({ block: 'nearest' }); }
            }
        }

        function open() {
            if (state.open) { return; }
            state.open = true; state.query = ''; state.active = 0;
            overlay = el('div', 'pal-overlay');
            var box = el('div', 'pal-box');
            box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Search');
            var head = el('div', 'pal-head');
            head.appendChild(el('i', 'fa fa-search'));
            input = el('input', 'pal-input');
            input.setAttribute('type', 'text'); input.setAttribute('placeholder', 'Search, or say what you want: restart lobby');
            input.setAttribute('autocomplete', 'off'); input.setAttribute('spellcheck', 'false'); input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', 'pal-list');
            head.appendChild(input);
            head.appendChild(el('kbd', 'pal-kbd', 'Esc'));
            list = el('div', 'pal-list'); list.id = 'pal-list'; list.setAttribute('role', 'listbox');
            box.appendChild(head); box.appendChild(list);
            box.appendChild(el('div', 'pal-foot', 'Up and down to move, Enter to open. Try "restart" and a server name.'));
            overlay.appendChild(box);
            doc.body.appendChild(overlay);
            overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) { close(); } });
            input.addEventListener('input', function () { state.query = input.value; state.active = 0; searchRemote(); render(); });
            input.addEventListener('keydown', function (e) {
                var items = flat(rankItems(build(), state.query));
                if (e.key === 'ArrowDown') { e.preventDefault(); state.active = items.length ? (state.active + 1) % items.length : 0; markActive(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); state.active = items.length ? (state.active - 1 + items.length) % items.length : 0; markActive(); }
                else if (e.key === 'Enter') { e.preventDefault(); choose(items[state.active]); }
                else if (e.key === 'Escape') { e.preventDefault(); close(); }
            });
            input.focus();
            loadServers();
            render();
        }

        function close() {
            if (!state.open) { return; }
            state.open = false;
            if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
            if (trigger) { trigger.focus(); }
        }

        if (trigger) { trigger.addEventListener('click', open); }
        doc.addEventListener('keydown', function (e) {
            var t = e.target;
            var typing = t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
            if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); state.open ? close() : open(); }
            else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(); }
        });
    }

    return { scoreItem: scoreItem, rankItems: rankItems, verbItems: verbItems, mount: mount };
});

/*
 * The card on the Settings page of a server where the owner writes the message that players see while the server is off.
 * Plain JavaScript, no build step: the panel gives an extension React and its http client.
 */
(function () {
    var Stratosphere = window.Stratosphere;
    if (!Stratosphere) return;

    // The colours of the game, for the preview.
    var COLOURS = {
        '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa', '4': '#aa0000', '5': '#aa00aa', '6': '#ffaa00', '7': '#aaaaaa',
        '8': '#555555', '9': '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
    };

    /** The pieces of a message with their colour: "§aGreen §cred" is two pieces. */
    function parts(text) {
        var result = [];
        var colour = COLOURS['7'];
        text.split(/(§[0-9a-fk-or])/i).forEach(function (piece) {
            var code = /^§([0-9a-fk-or])$/i.exec(piece);
            if (code) {
                var c = code[1].toLowerCase();
                if (COLOURS[c]) colour = COLOURS[c];
                else if (c === 'r') colour = COLOURS['7'];
            } else if (piece) {
                result.push({ text: piece, colour: colour });
            }
        });

        return result;
    }

    Stratosphere.register({
        id: 'offline-motd',
        setup: function (api) {
            var React = api.React;
            var h = React.createElement;

            function Card(props) {
                var uuid = props.server && props.server.uuid;
                var state = React.useState(null);
                var info = state[0];
                var setInfo = state[1];
                var textState = React.useState('');
                var text = textState[0];
                var setText = textState[1];
                var statusState = React.useState('');
                var status = statusState[0];
                var setStatus = statusState[1];
                var busyState = React.useState(false);
                var busy = busyState[0];
                var setBusy = busyState[1];

                var url = '/api/client/extensions/offline-motd/servers/' + uuid + '/message';

                React.useEffect(function () {
                    if (!uuid) return;
                    var cancelled = false;
                    api.http.get(url).then(function (response) {
                        if (cancelled) return;
                        setInfo(response.data);
                        setText(response.data.message || '');
                    }).catch(function () { /* The card is only there when it can be used. */ });

                    return function () { cancelled = true; };
                }, [uuid]);

                // Nothing for a person who may not change it, or when the admin does not allow it.
                if (!info || !info.allowed || !info.can_edit) return null;

                function save(value) {
                    setBusy(true);
                    setStatus('');
                    api.http.put(url, { message: value }).then(function (response) {
                        setInfo(response.data);
                        setText(response.data.message || '');
                        setStatus(value ? 'Saved.' : 'The message of the panel is used again.');
                    }).catch(function (error) {
                        var detail = error && error.response && error.response.data && error.response.data.errors;
                        setStatus((detail && detail[0] && detail[0].detail) || 'It could not be saved.');
                    }).then(function () { setBusy(false); });
                }

                var shown = (text.trim() ? text : info.default) || '';
                var preview = parts(shown).map(function (piece, index) {
                    return h('span', { key: index, style: { color: piece.colour } }, piece.text);
                });

                return h('div', { className: 'bg-white border border-neutral-500 rounded-xl shadow-md mb-6 md:mb-10 offline-motd-card' },
                    h('div', { className: 'px-5 py-4 border-b border-neutral-500' },
                        h('p', { className: 'text-sm font-semibold text-neutral-50' }, 'Offline message')),
                    h('div', { className: 'p-5' },
                        h('p', { className: 'text-sm text-neutral-300 mb-3' },
                            'What players see in the server list, and when they try to join, while this server is off. Leave it empty to use the message of the panel.'),
                        h('textarea', {
                            rows: 3,
                            maxLength: info.max_length,
                            value: text,
                            placeholder: info.default,
                            className: 'form-input',
                            onChange: function (event) { setText(event.target.value); },
                        }),
                        h('p', { className: 'text-xs text-neutral-400 mt-1 mb-3' }, '§a green, §c red, §l bold. A new line is a second line.'),
                        h('div', { className: 'offline-motd-preview' }, preview),
                        h('div', { className: 'offline-motd-actions' },
                            status && h('span', { className: 'text-xs text-neutral-300', style: { alignSelf: 'center' } }, status),
                            h('button', {
                                type: 'button', disabled: busy || !info.message, onClick: function () { save(''); },
                                className: 'text-sm text-neutral-300 hover:text-neutral-50 px-3',
                            }, 'Use the default'),
                            h('button', {
                                type: 'button', disabled: busy || text === (info.message || ''), onClick: function () { save(text); },
                                className: 'rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
                            }, busy ? 'Saving...' : 'Save'))));
            }

            api.slot('server.settings', Card);
        },
    });
})();

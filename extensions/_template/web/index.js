/*
 * The part that runs in the browser. window.Stratosphere is how an extension talks to the panel: register() with an id and a setup
 * function, which is given React, the http client of the panel and the ways to add something (a slot, a page).
 */
(function () {
    var Stratosphere = window.Stratosphere;
    if (!Stratosphere) return;

    Stratosphere.register({
        id: 'my-extension',
        setup: function (api) {
            var h = api.React.createElement;

            // A card on the Settings page of a server. The places (slots): server.console, server.settings, dashboard.top.
            function Card(props) {
                return h('div', { className: 'my-extension-card' }, 'Hello from My Extension, on the server ' + props.server.id);
            }
            api.slot('server.settings', Card);

            // A page in the menu of a server, at /server/<id>/ext/my-extension/hello
            function Page() {
                var state = api.React.useState('...');
                api.React.useEffect(function () {
                    api.http.get('/api/client/extensions/my-extension/hello').then(function (response) {
                        state[1](response.data.message);
                    });
                }, []);

                return h('div', { className: 'my-extension-card' }, state[0]);
            }
            api.serverPage({ path: 'hello', label: 'Hello', component: Page });
        },
    });
})();

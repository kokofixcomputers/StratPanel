import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import Spinner from '@/components/elements/Spinner';
import { usePermissions } from '@/plugins/usePermissions';
import { useOnlinePlayers } from '@/lib/onlinePlayers';
import detectCurrent from '@/components/server/versions/detectCurrent';
import { readWorldSeed } from '@/lib/worldSeed';

// Where tools/install-mctools.sh puts the build, a static copy of https://github.com/kokofixcomputers/mctoolsv3.
const TOOLS_URL = '/tools/index.html';

/** Messages the tools app sends, see src/lib/panel.ts in that repository for the other half of the protocol. */
interface ToolsMessage {
    source: 'mctools';
    type: 'ready' | 'run';
    id?: string;
    commands?: unknown;
}

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const name = ServerContext.useStoreState((state) => state.server.data!.name);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const [canControl] = usePermissions(['control.console']);
    const { online } = useOnlinePlayers(uuid);

    const frame = useRef<HTMLIFrameElement>(null);
    const [installed, setInstalled] = useState<boolean | null>(null);
    const [version, setVersion] = useState<{ version: string | null; software: string | null }>({
        version: null,
        software: null,
    });

    useEffect(() => {
        // A panel without the build answers with its own 404 page, which can not be framed.
        fetch(TOOLS_URL, { method: 'HEAD', credentials: 'same-origin' })
            .then((response) => setInstalled(response.ok))
            .catch(() => setInstalled(false));
    }, []);

    useEffect(() => {
        let cancelled = false;
        detectCurrent(uuid, null)
            .then((current) => !cancelled && setVersion({ version: current.version, software: current.type }))
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [uuid]);

    const [seed, setSeed] = useState<string | null>(null);

    // The seed lives in the world files and never changes, so it is read once.
    useEffect(() => {
        let cancelled = false;
        readWorldSeed(uuid)
            .then((value) => !cancelled && setSeed(value))
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [uuid]);

    const running = status === 'running';

    const post = useCallback((message: Record<string, unknown>) => {
        frame.current?.contentWindow?.postMessage({ source: 'stratpanel', ...message }, window.location.origin);
    }, []);

    const pushState = useCallback(
        () =>
            post({
                type: 'state',
                version: version.version,
                software: version.software,
                server: name,
                seed,
                running,
                canRun: canControl,
                players: online,
            }),
        [post, version, name, seed, running, canControl, online]
    );

    // Tell the tools about the server whenever any of it changes.
    useEffect(() => {
        pushState();
    }, [pushState]);

    useEffect(() => {
        const listener = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
            const data = event.data as ToolsMessage;
            if (!data || data.source !== 'mctools') return;

            if (data.type === 'ready') {
                pushState();
            } else if (data.type === 'run') {
                const commands = Array.isArray(data.commands)
                    ? data.commands.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
                    : [];
                let error = '';

                if (!canControl) error = 'You are not allowed to send console commands to this server.';
                else if (!running) error = 'The server is not running.';
                else if (!instance) error = 'The console is not connected yet.';
                else if (!commands.length) error = 'There is nothing to run.';

                if (!error)
                    commands.forEach((command) => instance!.send('send command', command.replace(/[\r\n]+/g, ' ')));
                post({ type: 'run-result', id: data.id, ok: !error, error });
            }
        };

        window.addEventListener('message', listener);

        return () => window.removeEventListener('message', listener);
    }, [pushState, post, canControl, running, instance]);

    return (
        <ServerContentBlock title={'Tools'}>
            <PageHeader
                title={'Tools'}
                subtitle={'Generators and calculators for Minecraft. Commands can run straight on this server.'}
            />
            {installed === null ? (
                <Spinner centered size={'large'} />
            ) : !installed ? (
                <EmptyState>
                    The tools are not installed on this panel. Run tools/install-mctools.sh from the panel directory to
                    add them.
                </EmptyState>
            ) : (
                <iframe
                    ref={frame}
                    title={'Minecraft tools'}
                    src={`${TOOLS_URL}?embed=1`}
                    className={'block w-full border-0 bg-transparent'}
                    style={{ height: 'calc(100vh - 12rem)', minHeight: '28rem' }}
                    // Same origin, so scripts run as the panel; sandbox would only cripple the wasm and clipboard.
                    allow={'clipboard-write'}
                />
            )}
        </ServerContentBlock>
    );
};

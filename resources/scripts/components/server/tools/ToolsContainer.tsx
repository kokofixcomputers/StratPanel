import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import Spinner from '@/components/elements/Spinner';
import { usePermissions } from '@/plugins/usePermissions';
import { useOnlinePlayers } from '@/lib/onlinePlayers';
import detectCurrent from '@/components/server/versions/detectCurrent';
import { readWorldSeed } from '@/lib/worldSeed';
import { toolsTheme } from '@/lib/toolsTheme';
import { findSchematicsFolder, MAX_SCHEMATIC_BYTES, saveSchematic } from '@/lib/worldEdit';
import getFileContents from '@/api/server/files/getFileContents';
import saveFileContents from '@/api/server/files/saveFileContents';
import { serializeProperties } from '@/lib/minecraft';
import { httpErrorToHuman } from '@/api/http';

// Where tools/install-mctools.sh puts the build, a static copy of https://github.com/kokofixcomputers/mctoolsv3.
const TOOLS_URL = '/tools/index.html';

/** Messages the tools app sends, see src/lib/panel.ts in that repository for the other half of the protocol. */
interface ToolsMessage {
    source: 'mctools';
    type: 'ready' | 'run' | 'save-property' | 'save-schematic';
    id?: string;
    commands?: unknown;
    key?: unknown;
    value?: unknown;
    name?: unknown;
    data?: unknown;
}

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const name = ServerContext.useStoreState((state) => state.server.data!.name);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const [canControl] = usePermissions(['control.console']);
    const [canEdit] = usePermissions(['file.update']);
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
    const [schematics, setSchematics] = useState<string | null>(null);

    // Where WorldEdit wants its schematics, when it is installed.
    useEffect(() => {
        let cancelled = false;
        findSchematicsFolder(uuid)
            .then((folder) => !cancelled && setSchematics(folder))
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [uuid]);

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
                theme: toolsTheme,
                worldEdit: schematics,
                running,
                canRun: canControl,
                canEdit,
                players: online,
            }),
        [post, version, name, seed, schematics, running, canControl, canEdit, online]
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
            } else if (data.type === 'save-schematic') {
                const reply = (error = '', path = '') =>
                    post({ type: 'save-result', id: data.id, ok: !error, error, path });

                if (!canEdit) return reply('You are not allowed to edit files on this server.');
                if (!schematics) return reply('WorldEdit is not installed on this server.');
                if (typeof data.name !== 'string' || !(data.data instanceof ArrayBuffer))
                    return reply('That is not a schematic.');
                if (data.data.byteLength > MAX_SCHEMATIC_BYTES)
                    return reply('That schematic is too big to save from here.');

                saveSchematic(uuid, schematics, data.name, data.data)
                    .then((path) => reply('', path))
                    .catch((e) => reply(httpErrorToHuman(e)));
            } else if (data.type === 'save-property') {
                const reply = (error = '') => post({ type: 'save-result', id: data.id, ok: !error, error });

                // Only the MOTD can be written this way, the tools are not trusted with the rest of the file.
                if (!canEdit) return reply('You are not allowed to edit files on this server.');
                if (data.key !== 'motd' || typeof data.value !== 'string')
                    return reply('That property can not be saved.');

                const value = data.value.replace(/[\r\n]+/g, ' ');
                getFileContents(uuid, '/server.properties')
                    .catch((e) => {
                        // A server that never ran has no file yet, but any other failure must not end up overwriting it.
                        if (e?.response?.status === 404) return '';
                        throw e;
                    })
                    .then((content) =>
                        saveFileContents(uuid, '/server.properties', serializeProperties(content, { motd: value }))
                    )
                    .then(() => reply())
                    .catch((e) => reply(httpErrorToHuman(e)));
            }
        };

        window.addEventListener('message', listener);

        return () => window.removeEventListener('message', listener);
    }, [pushState, post, canControl, canEdit, running, instance, uuid, schematics]);

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

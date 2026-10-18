import React, { useCallback, useEffect, useRef, useState } from 'react';
import { XIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import detectCurrent from '@/components/server/versions/detectCurrent';
import { toolsThemeFor } from '@/lib/toolsTheme';
import { useTheme } from '@/lib/theme';
import { httpErrorToHuman } from '@/api/http';

// The Superflat page of the tools build (see tools/install-mctools.sh), opened in its embedded mode.
const EDITOR_URL = '/tools/index.html?embed=1&only=1#/superflat';

interface Props {
    /** The generator-settings the server has now, so the editor starts from the layers that are there. */
    settings: string;
    onClose: () => void;
    /** Writes the settings the person chose. Rejects with the reason it could not. */
    onSave: (settings: string) => Promise<void>;
}

/**
 * Full screen editor for the layers of a Superflat world. The editor is the tools app in an iframe: it draws the layers
 * in 3D and hands the finished generator-settings back through postMessage, where the panel writes them.
 */
export default ({ settings, onClose, onSave }: Props) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const name = ServerContext.useStoreState((state) => state.server.data!.name);
    const [canEdit] = usePermissions(['file.update']);
    const frame = useRef<HTMLIFrameElement>(null);
    const [version, setVersion] = useState<string | null>(null);
    const [available, setAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        fetch('/tools/index.html', { method: 'HEAD', credentials: 'same-origin' })
            .then((response) => setAvailable(response.ok))
            .catch(() => setAvailable(false));
        detectCurrent(uuid, null)
            .then((current) => setVersion(current.version))
            .catch(() => undefined);
    }, [uuid]);

    const post = useCallback((message: Record<string, unknown>) => {
        frame.current?.contentWindow?.postMessage({ source: 'stratpanel', ...message }, window.location.origin);
    }, []);

    const { theme } = useTheme();

    const pushState = useCallback(
        () =>
            post({
                type: 'state',
                version,
                server: name,
                theme: toolsThemeFor(theme),
                flat: settings,
                running: false,
                canRun: false,
                canEdit,
                players: [],
            }),
        [post, version, name, settings, canEdit, theme]
    );

    useEffect(() => {
        pushState();
    }, [pushState]);

    useEffect(() => {
        const listener = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
            const data = event.data;
            if (!data || data.source !== 'mctools') return;

            if (data.type === 'ready') {
                pushState();
            } else if (data.type === 'save-superflat') {
                const reply = (error = '') => post({ type: 'save-result', id: data.id, ok: !error, error });

                if (!canEdit) return reply('You are not allowed to edit files on this server.');
                if (typeof data.settings !== 'string' || data.settings.length > 20000)
                    return reply('Those layers can not be saved.');

                onSave(data.settings)
                    .then(() => reply())
                    .catch((e) => reply(e?.response ? httpErrorToHuman(e) : e?.message || 'Could not save.'));
            }
        };
        window.addEventListener('message', listener);

        return () => window.removeEventListener('message', listener);
    }, [pushState, post, canEdit, onSave]);

    return (
        <div className={'fixed inset-0 z-50 flex flex-col bg-neutral-900'}>
            <div className={'flex items-center justify-between px-4 py-2 border-b border-neutral-700'}>
                <h2 className={'text-lg text-neutral-100'}>Superflat layers</h2>
                <button
                    type={'button'}
                    onClick={onClose}
                    aria-label={'Close the editor'}
                    className={'p-1 text-neutral-300 hover:text-snow'}
                >
                    <XIcon className={'w-6 h-6'} />
                </button>
            </div>
            {available === false ? (
                <p className={'p-6 text-neutral-300'}>
                    The tools are not installed on this panel, so the layer editor is not available. Run
                    tools/install-mctools.sh from the panel directory to add it, or pick one of the presets.
                </p>
            ) : (
                <iframe
                    ref={frame}
                    title={'Superflat layer editor'}
                    src={EDITOR_URL}
                    className={'flex-1 w-full border-0 bg-transparent'}
                />
            )}
        </div>
    );
};

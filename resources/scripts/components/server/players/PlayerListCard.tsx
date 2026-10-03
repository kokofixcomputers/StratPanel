import React, { useCallback, useEffect, useState } from 'react';
import tw from 'twin.macro';
import { PlusIcon, XIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import saveFileContents from '@/api/server/files/saveFileContents';
import { usePermissions } from '@/plugins/usePermissions';
import { httpErrorToHuman } from '@/api/http';
import { dashUuid, headUrl, lookupPlayer, Player, readJsonList } from '@/lib/minecraft';

export interface PlayerListConfig {
    file: string;
    title: string;
    icon: React.ReactNode;
    emptyText: string;
    placeholder: string;
    addCommand: (name: string) => string;
    removeCommand: (name: string) => string;
    toEntry: (player: Player) => Record<string, unknown>;
    badge?: (entry: Record<string, any>) => string | null;
}

export const PlayerHead = ({ uuid, name, size = 40 }: { uuid: string; name: string; size?: number }) => {
    const [failed, setFailed] = useState(false);

    return failed ? (
        <div
            css={tw`flex items-center justify-center rounded-lg bg-neutral-600 text-neutral-300 font-semibold uppercase flex-shrink-0`}
            style={{ width: size, height: size }}
        >
            {name.charAt(0)}
        </div>
    ) : (
        <img
            src={headUrl(uuid, size * 2)}
            alt={name}
            width={size}
            height={size}
            css={tw`rounded-lg flex-shrink-0 bg-neutral-600`}
            style={{ imageRendering: 'pixelated' }}
            onError={() => setFailed(true)}
        />
    );
};

type Entry = Record<string, any> & Player;

export const usePlayerFile = (file: string) => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const [entries, setEntries] = useState<Entry[] | null>(null);

    const load = useCallback(() => readJsonList<Entry>(uuid, file).then(setEntries), [uuid, file]);

    useEffect(() => {
        load();
    }, [load]);

    const running = status === 'running' || status === 'starting';

    return { uuid, entries, setEntries, load, running, instance };
};

export default ({ config, header }: { config: PlayerListConfig; header?: React.ReactNode }) => {
    const { uuid, entries, setEntries, load, running, instance } = usePlayerFile(config.file);
    const [canWrite] = usePermissions(['file.update']);
    const [canConsole] = usePermissions(['control.console']);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const canEdit = running ? canConsole : canWrite;

    const persist = async (next: Entry[], command: string) => {
        if (running && instance) {
            // The running server owns these files and would overwrite any change made to them, so ask it to do it.
            instance.send('send command', command);
            setEntries(next);
            setTimeout(load, 1500);
            return;
        }

        await saveFileContents(uuid, config.file, JSON.stringify(next, null, 2));
        setEntries(next);
    };

    const add = async () => {
        const value = name.trim();
        if (!value || !entries) return;

        setBusy(true);
        setError('');
        try {
            const player = await lookupPlayer(value);
            if (entries.some((entry) => entry.uuid.toLowerCase() === player.uuid.toLowerCase())) {
                throw new Error(`${player.name} is already on this list.`);
            }

            await persist(
                [...entries, { ...config.toEntry(player), uuid: dashUuid(player.uuid), name: player.name } as Entry],
                config.addCommand(player.name)
            );
            setName('');
        } catch (e) {
            setError((e as any)?.response ? httpErrorToHuman(e) : (e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (entry: Entry) => {
        if (!entries) return;

        setError('');
        try {
            await persist(
                entries.filter((e) => e.uuid !== entry.uuid),
                config.removeCommand(entry.name)
            );
        } catch (e) {
            setError(httpErrorToHuman(e));
        }
    };

    return (
        <div css={tw`flex flex-col bg-white border border-neutral-500 rounded-xl shadow-md`}>
            <div css={tw`flex items-center justify-between px-5 py-4 border-b border-neutral-500`}>
                <div css={tw`flex items-center min-w-0`}>
                    <span css={tw`text-primary-600 mr-3`}>{config.icon}</span>
                    <h2 css={tw`text-lg font-semibold text-neutral-50`}>{config.title}</h2>
                    {entries && (
                        <span
                            css={tw`ml-3 rounded-full bg-neutral-600 px-2.5 py-0.5 text-xs font-medium text-neutral-300`}
                        >
                            {entries.length}
                        </span>
                    )}
                </div>
                {header}
            </div>
            {canEdit && (
                <div css={tw`px-5 pt-5`}>
                    <form
                        css={tw`flex items-center gap-2`}
                        onSubmit={(e) => {
                            e.preventDefault();
                            add();
                        }}
                    >
                        <Input
                            type={'text'}
                            value={name}
                            placeholder={config.placeholder}
                            maxLength={16}
                            onChange={(e) => setName(e.currentTarget.value)}
                        />
                        <Button type={'submit'} disabled={busy || !name.trim()} css={tw`flex-shrink-0`}>
                            <PlusIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                            Add
                        </Button>
                    </form>
                    {error && <p css={tw`mt-2 text-sm text-red-600`}>{error}</p>}
                </div>
            )}
            <div css={tw`p-5 flex-1`}>
                {entries === null ? (
                    <Spinner centered size={'small'} />
                ) : entries.length === 0 ? (
                    <p css={tw`py-6 text-center text-sm text-neutral-400`}>{config.emptyText}</p>
                ) : (
                    <ul css={tw`space-y-2 max-h-80 overflow-y-auto -mr-2 pr-2`}>
                        {entries.map((entry) => {
                            const badge = config.badge?.(entry);

                            return (
                                <li
                                    key={entry.uuid}
                                    css={tw`flex items-center px-3 py-2 rounded-lg border border-neutral-500 bg-neutral-900`}
                                >
                                    <PlayerHead uuid={entry.uuid} name={entry.name} />
                                    <div css={tw`ml-3 flex-1 min-w-0`}>
                                        <p css={tw`text-sm font-semibold text-neutral-50 truncate`}>{entry.name}</p>
                                        <p css={tw`text-2xs font-mono text-neutral-400 truncate`}>{entry.uuid}</p>
                                    </div>
                                    {badge && (
                                        <span
                                            css={tw`mr-2 rounded-full bg-primary-50 text-primary-700 px-2.5 py-0.5 text-xs font-medium`}
                                        >
                                            {badge}
                                        </span>
                                    )}
                                    {canEdit && (
                                        <button
                                            type={'button'}
                                            aria-label={`Remove ${entry.name}`}
                                            css={tw`p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors duration-150`}
                                            onClick={() => remove(entry)}
                                        >
                                            <XIcon css={tw`w-4 h-4`} />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

import React, { useCallback, useEffect, useState } from 'react';
import { GlobeIcon, PlusIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import DimensionCard from '@/components/server/worlds/DimensionCard';
import GameRulesDialog from '@/components/server/worlds/GameRulesDialog';
import WorldSettingsDialog from '@/components/server/worlds/WorldSettingsDialog';
import loadDirectory from '@/api/server/files/loadDirectory';
import deleteFiles from '@/api/server/files/deleteFiles';
import saveFileContents from '@/api/server/files/saveFileContents';
import { isProxyServer } from '@/components/server/versions/detectCurrent';
import { Dimension, listDimensions } from '@/lib/dimensions';
import { parseProperties, readOptionalFile, serializeProperties } from '@/lib/minecraft';
import { readWorldSeed } from '@/lib/worldSeed';
import { WORLD_TYPES } from '@/lib/worldType';
import {
    readWorldSettings,
    validateWorldSettings,
    worldFolders,
    worldProperties,
    WorldSettings,
} from '@/lib/worldSettings';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';

const PROPERTIES = '/server.properties';

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className={'min-w-0'}>
        <p className={'text-xs uppercase tracking-wide text-neutral-400'}>{label}</p>
        <p className={'mt-1 truncate text-sm font-medium text-neutral-50'}>{children}</p>
    </div>
);

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const offline = status === 'offline';
    const { addFlash, clearFlashes } = useFlash();

    const [proxy, setProxy] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [raw, setRaw] = useState<Record<string, string>>({});
    const [settings, setSettings] = useState<WorldSettings>(() => readWorldSettings({}));
    const [seed, setSeed] = useState<string | null>(null);
    const [dimensions, setDimensions] = useState<Dimension[]>([]);
    const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
    const [busy, setBusy] = useState(false);
    const [rulesFor, setRulesFor] = useState<Dimension | null>(null);

    const message = useCallback(
        (type: 'success' | 'error', text: string) => addFlash({ key: 'worlds', type, message: text }),
        [addFlash]
    );

    const load = useCallback(async () => {
        const properties = await readOptionalFile(uuid, PROPERTIES);
        const values = Object.fromEntries((properties ? parseProperties(properties) : []).map((p) => [p.key, p.value]));
        const read = readWorldSettings(values);
        setRaw(values);
        setSettings(read);
        setDimensions(await listDimensions(uuid, read.name));
        setLoading(false);
        readWorldSeed(uuid)
            .then(setSeed)
            .catch(() => setSeed(null));
    }, [uuid]);

    useEffect(() => {
        isProxyServer(uuid).then(setProxy);
        load().catch((e) => {
            setLoading(false);
            message('error', httpErrorToHuman(e));
        });
    }, [load, uuid, message]);

    // A task that replaced a dimension, or another page, changed the files.
    useEffect(() => {
        if (offline) load().catch(() => undefined);
    }, [offline, load]);

    const writeProperties = async (values: Record<string, string>) => {
        const current = (await readOptionalFile(uuid, PROPERTIES)) || '';
        await saveFileContents(uuid, PROPERTIES, serializeProperties(current, values));
    };

    const submit = async (next: WorldSettings, wipe: boolean) => {
        const invalid = validateWorldSettings(next);
        if (invalid) return message('error', invalid);

        setBusy(true);
        clearFlashes('worlds');
        try {
            if (wipe) {
                const root = new Set((await loadDirectory(uuid, '/')).filter((f) => !f.isFile).map((f) => f.name));
                // A folder with the name of the new world would be loaded as it is, the world would not be new at all.
                if (next.name !== settings.name && root.has(next.name)) {
                    throw new Error(`There is already a folder called ${next.name}. Choose another name.`);
                }
                const old = worldFolders(settings.name, root);
                if (old.length) await deleteFiles(uuid, '/', old);
            }
            await writeProperties(
                worldProperties(next, {
                    levelType: raw['level-type'] || '',
                    generatorSettings: raw['generator-settings'] || '',
                })
            );
            message(
                'success',
                wipe
                    ? 'The old world was deleted. The new one is generated the next time the server starts.'
                    : 'World settings saved. They apply to the next world that is generated.'
            );
            setDialog(null);
            await load();
        } catch (e) {
            message('error', (e as any)?.response ? httpErrorToHuman(e) : (e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (proxy) {
        return (
            <ServerContentBlock title={'Worlds'}>
                <PageHeader title={'Worlds'} subtitle={'Manage the world of this server'} />
                <EmptyState>A proxy has no worlds.</EmptyState>
            </ServerContentBlock>
        );
    }

    return (
        <ServerContentBlock title={'Worlds'}>
            <FlashMessageRender byKey={'worlds'} className={'mb-4'} />
            <PageHeader title={'Worlds'} subtitle={'The world of this server and each of its dimensions'} />
            {!offline && (
                <p className={'mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                    Stop the server to change worlds. The game rules and seeds are read from the world files, so they
                    can be looked at while it runs, but not changed.
                </p>
            )}
            {loading ? (
                <Spinner centered size={'large'} />
            ) : (
                <>
                    <div className={'mb-6 rounded-xl border border-neutral-500 bg-white shadow-md'}>
                        <div
                            className={
                                'flex flex-wrap items-center justify-between gap-3 border-b border-neutral-500 px-5 py-4'
                            }
                        >
                            <p className={'flex items-center text-sm font-semibold text-neutral-50'}>
                                <GlobeIcon className={'mr-2 h-5 w-5 text-primary-600'} />
                                World
                            </p>
                            <div className={'flex flex-wrap gap-2'}>
                                <Button.Text onClick={() => setDialog('edit')}>Edit settings</Button.Text>
                                <span title={offline ? undefined : 'Stop the server first'}>
                                    <Button.Danger disabled={!offline} onClick={() => setDialog('create')}>
                                        <PlusIcon className={'mr-2 h-4 w-4'} />
                                        Create new world
                                    </Button.Danger>
                                </span>
                            </div>
                        </div>
                        <div className={'grid grid-cols-2 gap-4 px-5 py-4 md:grid-cols-5'}>
                            <Fact label={'Folder'}>{settings.name}</Fact>
                            <Fact label={'Type'}>{WORLD_TYPES.find((t) => t.id === settings.type)?.label}</Fact>
                            <Fact label={'Seed'}>
                                <span className={'font-mono'}>
                                    {seed || (dimensions.length ? 'Unknown' : 'Not generated yet')}
                                </span>
                            </Fact>
                            <Fact label={'Structures'}>{settings.structures ? 'On' : 'Off'}</Fact>
                            <Fact label={'Hardcore'}>{settings.hardcore ? 'On' : 'Off'}</Fact>
                        </div>
                    </div>

                    <ListHeader
                        icon={<GlobeIcon className={'h-6 w-6'} />}
                        title={'Dimensions'}
                        count={String(dimensions.length)}
                    />
                    {dimensions.length === 0 ? (
                        <EmptyState>
                            There is no world yet. It is generated when the server starts for the first time.
                        </EmptyState>
                    ) : (
                        <div className={'space-y-4'}>
                            {dimensions.map((dimension) => (
                                <DimensionCard
                                    key={dimension.path}
                                    dimension={dimension}
                                    uuid={uuid}
                                    offline={offline}
                                    onRules={setRulesFor}
                                    onChanged={() => load().catch(() => undefined)}
                                    onMessage={message}
                                />
                            ))}
                        </div>
                    )}
                    <p className={'mt-4 text-xs text-neutral-400'}>
                        Downloading, uploading and resetting whole worlds is in Settings.
                    </p>
                </>
            )}

            <WorldSettingsDialog
                mode={dialog === 'create' ? 'create' : 'edit'}
                open={dialog !== null}
                onClose={() => setDialog(null)}
                initial={settings}
                offline={offline}
                busy={busy}
                onSubmit={(next) => submit(next, dialog === 'create')}
            />
            <GameRulesDialog
                dimension={rulesFor}
                uuid={uuid}
                offline={offline}
                onClose={() => setRulesFor(null)}
                onSaved={(text) => message('success', text)}
            />
        </ServerContentBlock>
    );
};

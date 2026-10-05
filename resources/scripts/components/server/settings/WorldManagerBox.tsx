import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CubeIcon, DownloadIcon, GlobeIcon, RefreshIcon, TrashIcon, UploadIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import loadDirectory, { FileObject } from '@/api/server/files/loadDirectory';
import compressFiles from '@/api/server/files/compressFiles';
import decompressFiles from '@/api/server/files/decompressFiles';
import createDirectory from '@/api/server/files/createDirectory';
import deleteFiles from '@/api/server/files/deleteFiles';
import renameFiles from '@/api/server/files/renameFiles';
import saveFileContents from '@/api/server/files/saveFileContents';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl';
import { parseProperties, readOptionalFile, serializeProperties } from '@/lib/minecraft';
import { bytesToString } from '@/lib/formatters';
import { runTask } from '@/lib/tasks';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import Spinner from '@/components/elements/Spinner';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import { WORLDS_CHANGED } from '@/lib/worldImport';
import { isProxyServer } from '@/components/server/versions/detectCurrent';

const PROPERTIES = '/server.properties';
const TEMP = '.world-upload';
const IGNORED = new Set(['plugins', 'mods', 'logs', 'config', 'libraries', 'cache', 'versions', 'crash-reports']);

interface World {
    name: string;
    modified: Date;
    dimensions: string[];
}

const dimensionsOf = (name: string, names: Set<string>) => [
    ...(names.has(`${name}_nether`) ? [`${name}_nether`] : []),
    ...(names.has(`${name}_the_end`) ? [`${name}_the_end`] : []),
];

/** Everything on disk that belongs to a world: its folder and the Nether / End folders Paper keeps beside it. */
const folderSet = (world: World) => [world.name, ...world.dimensions];

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const offline = status === 'offline';
    const { addFlash, clearFlashes } = useFlash();

    const [proxy, setProxy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [levelName, setLevelName] = useState('world');
    const [seed, setSeed] = useState('');
    const [savedSeed, setSavedSeed] = useState('');
    const [worlds, setWorlds] = useState<World[]>([]);
    const [resetting, setResetting] = useState<World | null>(null);
    const [resetSeed, setResetSeed] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const input = useRef<HTMLInputElement>(null);

    const error = (e: unknown) => addFlash({ key: 'settings', type: 'error', message: httpErrorToHuman(e) });

    const load = useCallback(async () => {
        const properties = await readOptionalFile(uuid, PROPERTIES);
        const values = Object.fromEntries((properties ? parseProperties(properties) : []).map((p) => [p.key, p.value]));
        const level = values['level-name'] || 'world';
        setLevelName(level);
        setSeed(values['level-seed'] || '');
        setSavedSeed(values['level-seed'] || '');

        const root = await loadDirectory(uuid, '/').catch(() => [] as FileObject[]);
        const folders = root.filter((file) => !file.isFile && !IGNORED.has(file.name) && !file.name.startsWith('.'));
        const names = new Set(folders.map((f) => f.name));
        const checked = await Promise.all(
            folders.map(async (folder) => {
                const inside = await loadDirectory(uuid, `/${folder.name}`).catch(() => [] as FileObject[]);

                return inside.some((file) => file.name === 'level.dat') ? folder : null;
            })
        );

        setWorlds(
            checked
                .filter((f): f is FileObject => !!f)
                .filter(
                    (f) => !/_(nether|the_end)$/.test(f.name) || !names.has(f.name.replace(/_(nether|the_end)$/, ''))
                )
                .map((f) => ({ name: f.name, modified: f.modifiedAt, dimensions: dimensionsOf(f.name, names) }))
                .sort((a, b) => Number(b.name === level) - Number(a.name === level) || a.name.localeCompare(b.name))
        );
        setLoading(false);
    }, [uuid]);

    useEffect(() => {
        isProxyServer(uuid).then(setProxy);
        load();
        // A world that was added from somewhere else, such as a link, shows up without reloading the page.
        window.addEventListener(WORLDS_CHANGED, load);

        return () => window.removeEventListener(WORLDS_CHANGED, load);
    }, [load]);

    const writeSeed = async (value: string) => {
        const current = (await readOptionalFile(uuid, PROPERTIES)) || '';
        await saveFileContents(uuid, PROPERTIES, serializeProperties(current, { 'level-seed': value }));
    };

    const saveSeed = () => {
        clearFlashes('settings');
        writeSeed(seed.trim())
            .then(() => {
                setSavedSeed(seed.trim());
                addFlash({ key: 'settings', type: 'success', message: 'World seed saved.' });
            })
            .catch(error);
    };

    const download = (world: World) =>
        runTask('archive', `Archiving world ${world.name}`, async (report) => {
            report('Compressing...');
            const archive = await compressFiles(uuid, '/', folderSet(world), true);
            report(`${archive.name} (${bytesToString(archive.size)})`);
            window.location.href = await getFileDownloadUrl(uuid, `/${archive.name}`);
        });

    const reset = async () => {
        if (!resetting) return;
        const world = resetting;
        setResetting(null);
        clearFlashes('settings');
        try {
            await deleteFiles(uuid, '/', folderSet(world));
            if (world.name === levelName) {
                await writeSeed(resetSeed.trim());
                setSeed(resetSeed.trim());
                setSavedSeed(resetSeed.trim());
            }
            addFlash({
                key: 'settings',
                type: 'success',
                message:
                    world.name === levelName
                        ? 'World reset. A new world is generated the next time the server starts.'
                        : `World ${world.name} deleted.`,
            });
            load();
        } catch (e) {
            error(e);
        }
    };

    const upload = async () => {
        const file = uploadFile;
        if (!file) return;
        setUploadFile(null);
        clearFlashes('settings');

        await runTask('extract', `Importing world from ${file.name}`, async (report) => {
            await deleteFiles(uuid, '/', [TEMP]).catch(() => undefined);
            await createDirectory(uuid, '/', TEMP);

            const url = await getFileUploadUrl(uuid);
            await axios.post(
                url,
                { files: file },
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    params: { directory: `/${TEMP}` },
                    onUploadProgress: (e) => report('Uploading...', { done: e.loaded, total: e.total || file.size }),
                }
            );

            report('Extracting...');
            await decompressFiles(uuid, `/${TEMP}`, file.name, true);
            await deleteFiles(uuid, `/${TEMP}`, [file.name]);

            // The world is either the extracted folder itself or the single folder inside it.
            const top = await loadDirectory(uuid, `/${TEMP}`);
            let source = TEMP;
            if (!top.some((f) => f.name === 'level.dat')) {
                const nested = (
                    await Promise.all(
                        top
                            .filter((f) => !f.isFile)
                            .map(async (f) =>
                                (await loadDirectory(uuid, `/${TEMP}/${f.name}`)).some((i) => i.name === 'level.dat')
                                    ? f.name
                                    : null
                            )
                    )
                ).filter((n): n is string => !!n);
                if (nested.length !== 1) {
                    await deleteFiles(uuid, '/', [TEMP]);
                    throw new Error('Could not find a single world (a folder with level.dat) in that archive.');
                }
                source = `${TEMP}/${nested[0]}`;
            }

            report('Replacing the current world...');
            const root = new Set((await loadDirectory(uuid, '/')).map((f) => f.name));
            const existing = [levelName, `${levelName}_nether`, `${levelName}_the_end`].filter((n) => root.has(n));
            if (existing.length) await deleteFiles(uuid, '/', existing);
            await renameFiles(uuid, '/', [{ from: source, to: levelName }]);
            await deleteFiles(uuid, '/', [TEMP]).catch(() => undefined);
            load();
        });
    };

    // A proxy has no worlds.
    if (proxy) return null;

    const disabledHint = offline ? undefined : 'Stop the server first';

    return (
        <div className={'mb-6 rounded-xl border border-neutral-500 bg-white shadow-md md:mb-10'}>
            <div className={'flex items-center justify-between border-b border-neutral-500 px-5 py-4'}>
                <p className={'flex items-center text-sm font-semibold text-neutral-50'}>
                    <GlobeIcon className={'mr-2 h-5 w-5 text-primary-600'} />
                    World Manager
                </p>
                <input
                    ref={input}
                    type={'file'}
                    accept={'.zip,.tar.gz,.tgz'}
                    className={'hidden'}
                    onChange={(e) => {
                        setUploadFile(e.currentTarget.files?.[0] || null);
                        e.currentTarget.value = '';
                    }}
                />
                <span title={disabledHint}>
                    <Button.Text disabled={!offline} onClick={() => input.current?.click()}>
                        <UploadIcon className={'mr-2 h-4 w-4'} />
                        Upload world
                    </Button.Text>
                </span>
            </div>
            <div className={'p-5'}>
                {!offline && (
                    <p className={'mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                        Stop the server to upload, reset or delete a world. Downloading is always possible.
                    </p>
                )}
                {loading ? (
                    <Spinner centered size={'base'} />
                ) : worlds.length === 0 ? (
                    <p className={'py-4 text-center text-sm text-neutral-400'}>
                        No world has been generated yet. Start the server once, or upload one.
                    </p>
                ) : (
                    <div className={'space-y-2'}>
                        {worlds.map((world) => {
                            const active = world.name === levelName;

                            return (
                                <div
                                    key={world.name}
                                    className={
                                        'flex flex-wrap items-center gap-3 rounded-lg border border-neutral-500 bg-neutral-700/40 px-4 py-3'
                                    }
                                >
                                    <span
                                        className={
                                            'flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600'
                                        }
                                    >
                                        <CubeIcon className={'h-5 w-5'} />
                                    </span>
                                    <div className={'min-w-0 flex-1'}>
                                        <p className={'flex items-center text-sm font-semibold text-neutral-50'}>
                                            <span className={'truncate'}>{world.name}</span>
                                            {active && (
                                                <span
                                                    className={
                                                        'ml-2 rounded-full bg-primary-600 px-2 py-0.5 text-xs font-medium text-white'
                                                    }
                                                >
                                                    Active
                                                </span>
                                            )}
                                        </p>
                                        <p className={'text-xs text-neutral-300'}>
                                            Modified {world.modified.toLocaleString()}
                                            {world.dimensions.length > 0 && ' · includes Nether / End'}
                                        </p>
                                    </div>
                                    <Button.Text onClick={() => download(world)}>
                                        <DownloadIcon className={'mr-2 h-4 w-4'} />
                                        Download
                                    </Button.Text>
                                    <span title={disabledHint}>
                                        <Button.Danger
                                            variant={Button.Variants.Secondary}
                                            disabled={!offline}
                                            onClick={() => {
                                                setResetSeed(seed);
                                                setResetting(world);
                                            }}
                                        >
                                            {active ? (
                                                <RefreshIcon className={'mr-2 h-4 w-4'} />
                                            ) : (
                                                <TrashIcon className={'mr-2 h-4 w-4'} />
                                            )}
                                            {active ? 'Reset' : 'Delete'}
                                        </Button.Danger>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className={'mt-5'}>
                    <Label>World seed</Label>
                    <div className={'flex gap-2'}>
                        <Input
                            value={seed}
                            onChange={(e) => setSeed(e.currentTarget.value)}
                            placeholder={'Leave empty for a random seed'}
                        />
                        <Button.Text disabled={seed.trim() === savedSeed} onClick={saveSeed}>
                            Save
                        </Button.Text>
                    </div>
                    <p className={'mt-1 text-xs text-neutral-300'}>
                        Written to <code>level-seed</code> in server.properties. It only applies when a new world is
                        generated, so existing worlds are not changed.
                    </p>
                </div>
            </div>

            <Dialog.Confirm
                open={!!resetting}
                title={resetting?.name === levelName ? 'Reset world' : 'Delete world'}
                confirm={resetting?.name === levelName ? 'Reset world' : 'Delete world'}
                onClose={() => setResetting(null)}
                onConfirmed={reset}
            >
                <p className={'text-sm'}>
                    This permanently deletes{' '}
                    <span className={'font-semibold text-neutral-50'}>
                        {resetting && folderSet(resetting).join(', ')}
                    </span>
                    . Download it first if you may want it back.
                </p>
                {resetting?.name === levelName && (
                    <div className={'mt-4'}>
                        <Label>Seed for the new world</Label>
                        <Input
                            value={resetSeed}
                            onChange={(e) => setResetSeed(e.currentTarget.value)}
                            placeholder={'Leave empty for a random seed'}
                        />
                    </div>
                )}
            </Dialog.Confirm>
            <Dialog.Confirm
                open={!!uploadFile}
                title={'Upload world'}
                confirm={'Replace world'}
                onClose={() => setUploadFile(null)}
                onConfirmed={upload}
            >
                <p className={'text-sm'}>
                    <span className={'font-semibold text-neutral-50'}>{uploadFile?.name}</span> will replace the current
                    world <span className={'font-semibold text-neutral-50'}>{levelName}</span>, including its Nether and
                    End folders. The archive must contain one world (a folder with <code>level.dat</code>).
                </p>
            </Dialog.Confirm>
        </div>
    );
};

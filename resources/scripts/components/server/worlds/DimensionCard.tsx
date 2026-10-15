import React, { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CubeIcon, FireIcon, GlobeIcon, SparklesIcon, UploadIcon } from '@heroicons/react/solid';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import { httpErrorToHuman } from '@/api/http';
import {
    deleteDimension,
    Dimension,
    readDimensionFile,
    replaceDimension,
    WORLD_GEN_FILE,
    writeDimensionFile,
} from '@/lib/dimensions';
import { parseSeedInput, readSeed, withSeed } from '@/lib/dimensionNames';
import { NbtFile } from '@/lib/nbt';
import { runTask } from '@/lib/tasks';

const ICONS = { overworld: GlobeIcon, nether: FireIcon, end: SparklesIcon, custom: CubeIcon } as const;
const TONES = {
    overworld: 'bg-green-50 text-green-700',
    nether: 'bg-red-50 text-red-700',
    end: 'bg-purple-50 text-purple-700',
    custom: 'bg-primary-50 text-primary-700',
} as const;

interface Props {
    dimension: Dimension;
    uuid: string;
    offline: boolean;
    onRules: (dimension: Dimension) => void;
    // Something changed on the server, the list is read again.
    onChanged: () => void;
    onMessage: (type: 'success' | 'error', message: string) => void;
}

export default ({ dimension, uuid, offline, onRules, onChanged, onMessage }: Props) => {
    const Icon = ICONS[dimension.kind];
    const input = useRef<HTMLInputElement>(null);
    // The seed file of the dimension, null when it has none (the dimension then uses the seed of the world).
    const [seedFile, setSeedFile] = useState<NbtFile | null>(null);
    const [seedState, setSeedState] = useState<'loading' | 'ready' | 'none' | 'error'>('loading');
    const [seedText, setSeedText] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [replacing, setReplacing] = useState<File | null>(null);

    const loadSeed = () => {
        if (dimension.legacy) return setSeedState('none');
        setSeedState('loading');
        readDimensionFile(uuid, dimension, WORLD_GEN_FILE)
            .then((file) => {
                const seed = file && readSeed(file);
                if (!file || seed === null) return setSeedState('none');
                setSeedFile(file);
                setSeedText(String(seed));
                setSeedState('ready');
            })
            .catch(() => setSeedState('error'));
    };

    useEffect(loadSeed, [dimension.path, uuid]);

    const current = seedFile ? readSeed(seedFile) : null;
    const wanted = parseSeedInput(seedText);
    const seedChanged = wanted !== null && current !== null && wanted !== current;
    const hint = offline ? undefined : 'Stop the server first';

    const saveSeed = async () => {
        if (!seedFile || wanted === null) return;
        setSaving(true);
        try {
            await writeDimensionFile(uuid, dimension, WORLD_GEN_FILE, withSeed(seedFile, wanted));
            onMessage('success', `Seed of ${dimension.label} saved. Chunks that already exist keep their terrain.`);
            loadSeed();
        } catch (e) {
            onMessage('error', (e as any)?.response ? httpErrorToHuman(e) : (e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setDeleting(false);
        try {
            await deleteDimension(uuid, dimension);
            onMessage('success', `${dimension.label} deleted. The server makes a new one when it starts.`);
            onChanged();
        } catch (e) {
            onMessage('error', (e as any)?.response ? httpErrorToHuman(e) : (e as Error).message);
        }
    };

    const replace = () => {
        const file = replacing;
        setReplacing(null);
        if (!file) return;
        runTask('extract', `Replacing ${dimension.label}`, async (report) => {
            await replaceDimension(uuid, dimension, file, report);
            onChanged();
        });
    };

    return (
        <div className={'rounded-xl border border-neutral-500 bg-white shadow-md'}>
            <div className={'flex flex-wrap items-center gap-3 border-b border-neutral-500 px-5 py-4'}>
                <span
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                        TONES[dimension.kind]
                    }`}
                >
                    <Icon className={'h-5 w-5'} />
                </span>
                <div className={'min-w-0 flex-1'}>
                    <p className={'text-sm font-semibold text-neutral-50'}>
                        {dimension.label}
                        {dimension.legacy && (
                            <span
                                className={
                                    'ml-2 rounded-full bg-neutral-600 px-2 py-0.5 text-xs font-medium text-neutral-300'
                                }
                            >
                                Older world layout
                            </span>
                        )}
                    </p>
                    <p className={'truncate font-mono text-xs text-neutral-400'}>
                        {dimension.namespace}/{dimension.name}
                        {dimension.modified &&
                            ` · changed ${formatDistanceToNow(dimension.modified, { addSuffix: true })}`}
                    </p>
                </div>
                <div className={'flex flex-wrap items-center gap-2'}>
                    {!dimension.legacy && <Button.Text onClick={() => onRules(dimension)}>Game rules</Button.Text>}
                    {dimension.deletable && (
                        <>
                            <input
                                ref={input}
                                type={'file'}
                                accept={'.zip,.tar.gz,.tgz'}
                                className={'hidden'}
                                onChange={(e) => {
                                    setReplacing(e.currentTarget.files?.[0] || null);
                                    e.currentTarget.value = '';
                                }}
                            />
                            <span title={hint}>
                                <Button.Text disabled={!offline} onClick={() => input.current?.click()}>
                                    <UploadIcon className={'mr-2 h-4 w-4'} />
                                    Replace
                                </Button.Text>
                            </span>
                            <span title={hint}>
                                <Button.Text
                                    className={'!text-red-600'}
                                    disabled={!offline}
                                    onClick={() => setDeleting(true)}
                                >
                                    Delete
                                </Button.Text>
                            </span>
                        </>
                    )}
                </div>
            </div>
            {!dimension.legacy && (
                <div className={'px-5 py-4'}>
                    <Label htmlFor={`seed-${dimension.key}`}>Seed</Label>
                    {seedState === 'loading' && <p className={'text-sm text-neutral-400'}>Reading the seed...</p>}
                    {seedState === 'none' && (
                        <p className={'text-sm text-neutral-400'}>
                            This dimension has no seed of its own, it uses the seed of the world.
                        </p>
                    )}
                    {seedState === 'error' && (
                        <p className={'text-sm text-red-500'}>The seed file of this dimension could not be read.</p>
                    )}
                    {seedState === 'ready' && (
                        <>
                            <div className={'flex gap-2'}>
                                <Input
                                    id={`seed-${dimension.key}`}
                                    className={'font-mono'}
                                    value={seedText}
                                    disabled={!offline}
                                    onChange={(e) => setSeedText(e.currentTarget.value)}
                                />
                                <span title={hint}>
                                    <Button disabled={!offline || !seedChanged || saving} onClick={saveSeed}>
                                        {saving ? 'Saving...' : 'Save seed'}
                                    </Button>
                                </span>
                            </div>
                            <p className={'mt-1 text-xs text-neutral-400'}>
                                Text is turned into a number the way the game does it. Only chunks that are not
                                generated yet use the new seed, so the terrain changes where the old and the new meet.
                            </p>
                        </>
                    )}
                </div>
            )}
            <Dialog.Confirm
                open={deleting}
                onClose={() => setDeleting(false)}
                title={`Delete ${dimension.label}?`}
                confirm={'Delete'}
                onConfirmed={remove}
            >
                Everything built in{' '}
                <span className={'font-mono'}>
                    {dimension.namespace}/{dimension.name}
                </span>{' '}
                is deleted from the server. The game generates a new one the next time a player goes there. This can not
                be undone.
            </Dialog.Confirm>
            <Dialog.Confirm
                open={!!replacing}
                onClose={() => setReplacing(null)}
                title={`Replace ${dimension.label}?`}
                confirm={'Replace'}
                onConfirmed={replace}
            >
                The contents of <span className={'font-mono'}>{replacing?.name}</span> take the place of this dimension.
                It is uploaded and checked first, and only then is the current one deleted.
            </Dialog.Confirm>
        </div>
    );
};

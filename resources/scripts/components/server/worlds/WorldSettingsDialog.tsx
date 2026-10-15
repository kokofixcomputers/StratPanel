import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/elements/dialog';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import Select from '@/components/elements/Select';
import Switch from '@/components/elements/Switch';
import { Button } from '@/components/elements/button/index';
import SuperflatEditor from '@/components/server/settings/SuperflatEditor';
import { FLAT_PRESETS, matchFlatPreset, WORLD_TYPES, WorldType } from '@/lib/worldType';
import { validateWorldSettings, WorldSettings } from '@/lib/worldSettings';

interface Props {
    // create wipes the world that is there and makes a new one, edit only changes the settings the next world is made with.
    mode: 'create' | 'edit';
    open: boolean;
    onClose: () => void;
    initial: WorldSettings;
    // Whether the server is stopped, the files are not touched while it runs.
    offline: boolean;
    busy: boolean;
    onSubmit: (settings: WorldSettings) => void;
}

/**
 * The settings of a world in the dialog the panel also uses for the EULA. The draft is kept while the Superflat editor is
 * open, which is a screen of its own: the dialog steps aside for it and comes back with the layers that were made.
 */
export default ({ mode, open, onClose, initial, offline, busy, onSubmit }: Props) => {
    const [draft, setDraft] = useState<WorldSettings>(initial);
    const [editing, setEditing] = useState(false);
    // The switches keep their own state, so they start over each time the dialog is opened.
    const [session, setSession] = useState(0);

    useEffect(() => {
        if (open) {
            setDraft(initial);
            setSession((n) => n + 1);
        }
        // Only when the dialog opens, a change of the page behind it must not undo what was typed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const change = (patch: Partial<WorldSettings>) => setDraft((d) => ({ ...d, ...patch }));
    const error = validateWorldSettings(draft);
    const flat = matchFlatPreset(draft.layers);
    const creating = mode === 'create';

    return (
        <>
            <Dialog.Confirm
                open={open && !editing}
                onClose={() => !busy && onClose()}
                title={creating ? 'Create a new world' : 'World settings'}
                confirm={busy ? 'Working...' : creating ? 'Wipe and create' : 'Save settings'}
                confirmVariant={creating ? 'danger' : 'primary'}
                onConfirmed={() => {
                    if (!busy && offline && !error) onSubmit(draft);
                }}
            >
                {creating ? (
                    <p className={'mb-4 text-sm leading-relaxed text-neutral-300'}>
                        This <strong>deletes the world that is on the server now</strong>, all its dimensions included,
                        and sets up a new one with the settings below. It is generated the next time the server starts.
                        Make a backup first if you may want it back.
                    </p>
                ) : (
                    <p className={'mb-4 text-sm leading-relaxed text-neutral-300'}>
                        These are written to server.properties and apply when a world is generated. A world that exists
                        keeps the settings it was made with.
                    </p>
                )}
                {!offline && (
                    <p className={'mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                        Stop the server first, it would write its own settings over these.
                    </p>
                )}
                <div className={'space-y-4'}>
                    <div>
                        <Label htmlFor={'world-name'}>World folder</Label>
                        <Input
                            id={'world-name'}
                            value={draft.name}
                            onChange={(e) => change({ name: e.currentTarget.value })}
                        />
                    </div>
                    <div>
                        <Label htmlFor={'world-seed'}>Seed</Label>
                        <Input
                            id={'world-seed'}
                            value={draft.seed}
                            placeholder={'Leave empty for a random seed'}
                            onChange={(e) => change({ seed: e.currentTarget.value })}
                        />
                    </div>
                    <div>
                        <Label htmlFor={'world-type'}>World type</Label>
                        <Select
                            id={'world-type'}
                            value={draft.type}
                            onChange={(e) => change({ type: e.currentTarget.value as WorldType })}
                        >
                            {WORLD_TYPES.map((type) => (
                                <option key={type.id} value={type.id}>
                                    {type.label}
                                </option>
                            ))}
                        </Select>
                        <p className={'mt-1 text-xs text-neutral-300'}>
                            {WORLD_TYPES.find((type) => type.id === draft.type)?.description}
                        </p>
                    </div>
                    {draft.type === 'flat' && (
                        <div>
                            <Label htmlFor={'world-layers'}>Superflat layers</Label>
                            <div className={'flex gap-2'}>
                                <Select
                                    id={'world-layers'}
                                    value={flat}
                                    onChange={(e) => {
                                        const id = e.currentTarget.value;
                                        change({ layers: FLAT_PRESETS.find((p) => p.id === id)?.settings || '' });
                                    }}
                                >
                                    <option value={''}>Default layers</option>
                                    {FLAT_PRESETS.map((preset) => (
                                        <option key={preset.id} value={preset.id}>
                                            {preset.label}
                                        </option>
                                    ))}
                                    {flat === 'custom' && <option value={'custom'}>Custom layers</option>}
                                </Select>
                                <Button.Text
                                    className={'flex-shrink-0 whitespace-nowrap'}
                                    onClick={() => setEditing(true)}
                                >
                                    Edit layers
                                </Button.Text>
                            </div>
                        </div>
                    )}
                    <Switch
                        key={`structures-${session}`}
                        name={'structures'}
                        label={'Generate structures'}
                        description={'Villages, strongholds and the other structures of the game.'}
                        defaultChecked={draft.structures}
                        onChange={(e) => change({ structures: e.currentTarget.checked })}
                    />
                    <Switch
                        key={`hardcore-${session}`}
                        name={'hardcore'}
                        label={'Hardcore'}
                        description={'Players are banned from the world when they die.'}
                        defaultChecked={draft.hardcore}
                        onChange={(e) => change({ hardcore: e.currentTarget.checked })}
                    />
                    {error && <p className={'text-xs text-red-500'}>{error}</p>}
                </div>
            </Dialog.Confirm>
            {editing && (
                <SuperflatEditor
                    settings={draft.layers}
                    onClose={() => setEditing(false)}
                    onSave={async (settings) => {
                        change({ layers: settings });
                        setEditing(false);
                    }}
                />
            )}
        </>
    );
};

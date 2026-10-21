import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { PencilIcon, RefreshIcon, TrashIcon } from '@heroicons/react/solid';
import http, { httpErrorToHuman } from '@/api/http';
import { Button } from '@/components/elements/button/index';
import { ThemeConfig, withDefaults } from '@/lib/themeConfig';

interface MyPreset {
    id: string;
    name: string;
    config: Partial<ThemeConfig>;
}

const icon = 'rounded-md p-1 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-50';

/**
 * The looks an admin keeps under a name: try many styles in the editor, keep the ones you like, come back to them. They are kept on the
 * server (shared with the other admins), apart from the saved theme, and only change what is shown when one is applied and the theme saved.
 */
export default ({ config, onApply }: { config: ThemeConfig; onApply: (config: ThemeConfig) => void }) => {
    const [presets, setPresets] = useState<MyPreset[] | null>(null);
    const [name, setName] = useState('');
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        http.get('/api/client/theme/presets')
            .then(({ data }) => setPresets(data))
            .catch(() => setPresets([]));
    }, []);

    const run = (work: () => Promise<{ data: MyPreset[] }>, done: string) => {
        setBusy(true);
        setMessage(null);
        work()
            .then(({ data }) => {
                setPresets(data);
                setMessage({ text: done, error: false });
            })
            .catch((e) => setMessage({ text: httpErrorToHuman(e), error: true }))
            .then(() => setBusy(false));
    };

    const create = () => {
        if (!name.trim()) return;
        run(() => http.post('/api/client/theme/presets', { name: name.trim(), config }), 'Saved as a preset.');
        setName('');
    };

    return (
        <div className={'space-y-3'}>
            <div className={'flex gap-2'}>
                <input
                    value={name}
                    maxLength={40}
                    placeholder={'Name for the look you have now'}
                    onChange={(e) => setName(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && create()}
                    className={
                        'min-w-0 flex-1 rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100'
                    }
                />
                <Button type={'button'} disabled={busy || !name.trim()} onClick={create}>
                    Save as preset
                </Button>
            </div>
            {message && (
                <p className={`text-xs ${message.error ? 'text-red-600' : 'text-green-700'}`}>{message.text}</p>
            )}
            {presets === null && <p className={'text-xs text-neutral-400'}>Loading your presets...</p>}
            {presets?.length === 0 && (
                <p className={'text-xs text-neutral-400'}>
                    Nothing saved yet. Make a look you like, save it here, and try other styles without losing it.
                </p>
            )}
            <ul className={'space-y-1.5'}>
                {presets?.map((preset) => {
                    const accent = withDefaults(preset.config).accent;
                    const active = config.preset === `custom:${preset.id}`;

                    return (
                        <li
                            key={preset.id}
                            className={classNames(
                                'flex items-center gap-1 rounded-lg border px-2 py-1.5',
                                active ? 'border-primary-600 bg-primary-50' : 'border-neutral-500'
                            )}
                        >
                            {renaming?.id === preset.id ? (
                                <input
                                    autoFocus
                                    value={renaming.name}
                                    maxLength={40}
                                    onChange={(e) => setRenaming({ id: preset.id, name: e.currentTarget.value })}
                                    onBlur={() => setRenaming(null)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') setRenaming(null);
                                        if (e.key === 'Enter' && renaming.name.trim()) {
                                            run(
                                                () =>
                                                    http.put(`/api/client/theme/presets/${preset.id}`, {
                                                        name: renaming.name.trim(),
                                                    }),
                                                'Renamed.'
                                            );
                                            setRenaming(null);
                                        }
                                    }}
                                    className={
                                        'min-w-0 flex-1 rounded-md border border-neutral-500 bg-white px-2 py-0.5 text-sm text-neutral-100'
                                    }
                                />
                            ) : (
                                <button
                                    type={'button'}
                                    onClick={() =>
                                        onApply(withDefaults({ ...preset.config, preset: `custom:${preset.id}` }))
                                    }
                                    className={'flex min-w-0 flex-1 items-center gap-2 text-left'}
                                    title={'Use this look in the editor'}
                                >
                                    <span
                                        className={'h-4 w-4 flex-shrink-0 rounded-full'}
                                        style={{ background: accent }}
                                    />
                                    <span className={'truncate text-sm text-neutral-100'}>{preset.name}</span>
                                </button>
                            )}
                            <button
                                type={'button'}
                                className={icon}
                                disabled={busy}
                                title={'Replace it with the look you have now'}
                                aria-label={`Replace ${preset.name} with the current look`}
                                onClick={() => {
                                    if (window.confirm(`Replace "${preset.name}" with the look you have now?`))
                                        run(
                                            () =>
                                                http.post('/api/client/theme/presets', {
                                                    id: preset.id,
                                                    name: preset.name,
                                                    config,
                                                }),
                                            'Preset updated.'
                                        );
                                }}
                            >
                                <RefreshIcon className={'h-4 w-4'} />
                            </button>
                            <button
                                type={'button'}
                                className={icon}
                                title={'Rename'}
                                aria-label={`Rename ${preset.name}`}
                                onClick={() => setRenaming({ id: preset.id, name: preset.name })}
                            >
                                <PencilIcon className={'h-4 w-4'} />
                            </button>
                            <button
                                type={'button'}
                                className={icon}
                                disabled={busy}
                                title={'Delete'}
                                aria-label={`Delete ${preset.name}`}
                                onClick={() => {
                                    if (window.confirm(`Delete the preset "${preset.name}"?`))
                                        run(() => http.delete(`/api/client/theme/presets/${preset.id}`), 'Deleted.');
                                }}
                            >
                                <TrashIcon className={'h-4 w-4'} />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

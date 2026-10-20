import React, { useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid';
import { arrange, extraKey, safeUrl, SIDEBAR_GROUPS, SIDEBAR_LABELS } from '@/lib/sidebarLayout';
import { SidebarExtra, ThemeConfig } from '@/lib/themeConfig';

type Sidebar = ThemeConfig['sidebar'];

const GROUP_TITLES = [...SIDEBAR_GROUPS.map((g) => g.title), 'More'];

const small = 'rounded-md p-1 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-50 disabled:opacity-30';

/** The order, hidden items and own links of the server sidebar. */
export default ({ sidebar, onChange }: { sidebar: Sidebar; onChange: (sidebar: Sidebar) => void }) => {
    const [label, setLabel] = useState('');
    const [url, setUrl] = useState('');
    const [group, setGroup] = useState('Manage');
    const [error, setError] = useState<string | null>(null);

    // Every key in the order the sidebar shows them now, group after group. Moving one swaps two neighbours inside their group.
    const entriesOf = (title: string): { key: string; label: string; extra?: SidebarExtra }[] => {
        const base = (SIDEBAR_GROUPS.find((g) => g.title === title)?.paths ?? []).map((path) => ({
            key: path,
            label: SIDEBAR_LABELS[path] ?? path,
        }));
        const own = sidebar.extra
            .filter((extra) => extra.group === title)
            .map((extra) => ({ key: extraKey(extra.id), label: extra.label, extra }));

        return arrange([...base, ...own], sidebar.order);
    };

    const flat = GROUP_TITLES.flatMap((title) => entriesOf(title).map((entry) => entry.key));

    const move = (title: string, key: string, by: number) => {
        const keys = entriesOf(title).map((entry) => entry.key);
        const at = keys.indexOf(key);
        const to = at + by;
        if (to < 0 || to >= keys.length) return;
        keys.splice(to, 0, keys.splice(at, 1)[0]);
        // The group's own slots in the flat list are refilled in the new order.
        const slots = flat.map((k, i) => (keys.includes(k) ? i : -1)).filter((i) => i >= 0);
        const next = [...flat];
        slots.forEach((slot, i) => (next[slot] = keys[i]));
        onChange({ ...sidebar, order: next });
    };

    const toggle = (path: string) =>
        onChange({
            ...sidebar,
            hidden: sidebar.hidden.includes(path)
                ? sidebar.hidden.filter((p) => p !== path)
                : [...sidebar.hidden, path],
        });

    const add = () => {
        if (!label.trim()) return setError('Give the link a name.');
        if (!safeUrl(url.trim())) return setError('Use a path of the panel (/something) or an http(s):// address.');
        const id = Math.random().toString(36).slice(2, 10);
        onChange({
            ...sidebar,
            extra: [...sidebar.extra, { id, label: label.trim().slice(0, 40), url: url.trim(), newTab: true, group }],
        });
        setLabel('');
        setUrl('');
        setError(null);
    };

    return (
        <div className={'space-y-4'}>
            {GROUP_TITLES.map((title) => {
                const entries = entriesOf(title);
                if (!entries.length) return null;

                return (
                    <div key={title}>
                        <p className={'mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>{title}</p>
                        <ul className={'rounded-lg border border-neutral-500'}>
                            {entries.map((entry, i) => {
                                const hidden = sidebar.hidden.includes(entry.key);

                                return (
                                    <li
                                        key={entry.key}
                                        className={
                                            'flex items-center gap-1 border-b border-neutral-500 px-2 py-1 last:border-b-0'
                                        }
                                    >
                                        <span
                                            className={`flex-1 truncate text-sm ${
                                                hidden ? 'text-neutral-400 line-through' : 'text-neutral-100'
                                            }`}
                                        >
                                            {entry.label}
                                            {entry.extra && (
                                                <span className={'ml-1.5 text-2xs text-neutral-400'}>link</span>
                                            )}
                                        </span>
                                        <button
                                            type={'button'}
                                            className={small}
                                            disabled={i === 0}
                                            onClick={() => move(title, entry.key, -1)}
                                            aria-label={'Move up'}
                                        >
                                            <ArrowUpIcon className={'h-4 w-4'} />
                                        </button>
                                        <button
                                            type={'button'}
                                            className={small}
                                            disabled={i === entries.length - 1}
                                            onClick={() => move(title, entry.key, 1)}
                                            aria-label={'Move down'}
                                        >
                                            <ArrowDownIcon className={'h-4 w-4'} />
                                        </button>
                                        {entry.extra ? (
                                            <button
                                                type={'button'}
                                                className={small}
                                                aria-label={'Remove the link'}
                                                onClick={() =>
                                                    onChange({
                                                        ...sidebar,
                                                        extra: sidebar.extra.filter((e) => e.id !== entry.extra!.id),
                                                        order: sidebar.order.filter((k) => k !== entry.key),
                                                    })
                                                }
                                            >
                                                <TrashIcon className={'h-4 w-4'} />
                                            </button>
                                        ) : (
                                            <button
                                                type={'button'}
                                                className={small}
                                                aria-label={hidden ? 'Show' : 'Hide'}
                                                onClick={() => toggle(entry.key)}
                                            >
                                                {hidden ? (
                                                    <EyeOffIcon className={'h-4 w-4'} />
                                                ) : (
                                                    <EyeIcon className={'h-4 w-4'} />
                                                )}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}
            <div className={'rounded-lg border border-dashed border-neutral-400 p-3'}>
                <p className={'mb-2 text-sm font-medium text-neutral-100'}>Add a link</p>
                <div className={'space-y-2'}>
                    <input
                        value={label}
                        maxLength={40}
                        placeholder={'Name'}
                        onChange={(e) => setLabel(e.currentTarget.value)}
                        className={
                            'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100'
                        }
                    />
                    <input
                        value={url}
                        placeholder={'https://example.com or /server/{id}/files'}
                        onChange={(e) => setUrl(e.currentTarget.value)}
                        className={
                            'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 font-mono text-xs text-neutral-100'
                        }
                    />
                    <div className={'flex items-center gap-2'}>
                        <select
                            value={group}
                            onChange={(e) => setGroup(e.currentTarget.value)}
                            className={
                                'flex-1 rounded-lg border border-neutral-500 bg-white px-2 py-1.5 text-sm text-neutral-100'
                            }
                        >
                            {GROUP_TITLES.map((title) => (
                                <option key={title}>{title}</option>
                            ))}
                        </select>
                        <button
                            type={'button'}
                            onClick={add}
                            className={
                                'inline-flex items-center rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-snow'
                            }
                        >
                            <PlusIcon className={'mr-1 h-4 w-4'} />
                            Add
                        </button>
                    </div>
                    {error && <p className={'text-xs text-red-600'}>{error}</p>}
                    <p className={'text-2xs text-neutral-400'}>
                        {'{id}'} and {'{uuid}'} in the address stand for the server. Items cannot be moved to another
                        group.
                    </p>
                </div>
            </div>
        </div>
    );
};

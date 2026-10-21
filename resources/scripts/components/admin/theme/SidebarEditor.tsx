import React, { useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid';
import {
    explicitCategories,
    extraKey,
    SIDEBAR_DEFAULTS,
    SidebarCategory,
    SidebarId,
    SidebarLayout,
    safeUrl,
} from '@/lib/sidebarLayout';

const small = 'rounded-md p-1 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-50 disabled:opacity-30';
const input = 'rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100';

const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * The categories and items of one sidebar: add, rename, move and remove categories, move items between them and inside them, hide the built
 * in ones, add links of your own. The first change turns the default categories into the layout's own.
 */
export default <L extends SidebarLayout>({
    id,
    layout,
    onChange,
}: {
    id: SidebarId;
    layout: L;
    onChange: (layout: L) => void;
}) => {
    const defaults = SIDEBAR_DEFAULTS[id];
    const [label, setLabel] = useState('');
    const [url, setUrl] = useState('');
    const [target, setTarget] = useState('');
    const [title, setTitle] = useState('');
    const [error, setError] = useState<string | null>(null);

    const categories = explicitCategories(id, layout);
    const placed = new Set(categories.flatMap((c) => c.items));
    // Built in items that are in no category, they are shown under "More" until they are put somewhere.
    const loose = Object.keys(defaults.labels).filter((key) => !placed.has(key));
    const labelOf = (key: string): string =>
        key.startsWith('extra:')
            ? layout.extra.find((e) => `extra:${e.id}` === key)?.label ?? key
            : defaults.labels[key] ?? key;

    const save = (next: SidebarCategory[], rest: Partial<SidebarLayout> = {}) =>
        onChange({ ...layout, categories: next, ...rest });
    const patch = (index: number, changes: Partial<SidebarCategory>) =>
        save(categories.map((c, i) => (i === index ? { ...c, ...changes } : c)));

    const moveCategory = (index: number, by: number) => {
        const next = [...categories];
        const to = index + by;
        if (to < 0 || to >= next.length) return;
        next.splice(to, 0, next.splice(index, 1)[0]);
        save(next);
    };
    const moveItem = (index: number, key: string, by: number) => {
        const items = [...categories[index].items];
        const at = items.indexOf(key);
        const to = at + by;
        if (to < 0 || to >= items.length) return;
        items.splice(to, 0, items.splice(at, 1)[0]);
        patch(index, { items });
    };
    const sendItem = (from: number, key: string, to: number) => {
        if (from === to) return;
        save(
            categories.map((c, i) =>
                i === from
                    ? { ...c, items: c.items.filter((k) => k !== key) }
                    : i === to
                    ? { ...c, items: [...c.items, key] }
                    : c
            )
        );
    };
    const removeCategory = (index: number) => {
        const gone = categories[index];
        const rest = categories.filter((_, i) => i !== index);
        // What was in it moves to the first category that is left; links of your own that find no place are deleted with it.
        if (rest.length === 0) return save([], { extra: [] as any });
        save(rest.map((c, i) => (i === 0 ? { ...c, items: [...c.items, ...gone.items] } : c)));
    };
    const toggle = (key: string) =>
        onChange({
            ...layout,
            categories,
            hidden: layout.hidden.includes(key) ? layout.hidden.filter((k) => k !== key) : [...layout.hidden, key],
        });
    const removeExtra = (key: string) =>
        onChange({
            ...layout,
            categories: categories.map((c) => ({ ...c, items: c.items.filter((k) => k !== key) })),
            extra: layout.extra.filter((e) => extraKey(e.id) !== key),
        });

    const addCategory = () => {
        if (!title.trim()) return;
        save([...categories, { id: newId(), title: title.trim().slice(0, 30), items: [] }]);
        setTitle('');
    };
    const addLink = () => {
        if (!label.trim()) return setError('Give the link a name.');
        if (!safeUrl(url.trim())) return setError('Use a path of the panel (/something) or an http(s):// address.');
        const linkId = newId();
        const into = categories.find((c) => c.id === target)?.id ?? categories[0]?.id;
        onChange({
            ...layout,
            extra: [...layout.extra, { id: linkId, label: label.trim().slice(0, 40), url: url.trim(), newTab: true }],
            categories: categories.map((c) => (c.id === into ? { ...c, items: [...c.items, extraKey(linkId)] } : c)),
        });
        setLabel('');
        setUrl('');
        setError(null);
    };

    return (
        <div className={'space-y-4'}>
            {categories.map((category, index) => (
                <div key={category.id} className={'rounded-lg border border-neutral-500'}>
                    <div
                        className={'flex items-center gap-1 border-b border-neutral-500 bg-neutral-600/50 px-2 py-1.5'}
                    >
                        <input
                            value={category.title}
                            maxLength={30}
                            aria-label={'Name of the category'}
                            onChange={(e) => patch(index, { title: e.currentTarget.value })}
                            className={
                                'min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-300 hover:border-neutral-500 focus:border-primary-600 focus:bg-white focus:outline-none'
                            }
                        />
                        <button
                            type={'button'}
                            className={small}
                            disabled={index === 0}
                            onClick={() => moveCategory(index, -1)}
                            aria-label={'Move the category up'}
                        >
                            <ArrowUpIcon className={'h-4 w-4'} />
                        </button>
                        <button
                            type={'button'}
                            className={small}
                            disabled={index === categories.length - 1}
                            onClick={() => moveCategory(index, 1)}
                            aria-label={'Move the category down'}
                        >
                            <ArrowDownIcon className={'h-4 w-4'} />
                        </button>
                        <button
                            type={'button'}
                            className={small}
                            onClick={() => removeCategory(index)}
                            aria-label={'Remove the category'}
                        >
                            <TrashIcon className={'h-4 w-4'} />
                        </button>
                    </div>
                    <ul>
                        {category.items.length === 0 && (
                            <li className={'px-3 py-2 text-xs text-neutral-400'}>
                                Nothing here, move an item in or add a link.
                            </li>
                        )}
                        {category.items.map((key, i) => {
                            const isExtra = key.startsWith('extra:');
                            const hidden = layout.hidden.includes(key);

                            return (
                                <li
                                    key={key}
                                    className={
                                        'flex items-center gap-1 border-b border-neutral-500 px-2 py-1 last:border-b-0'
                                    }
                                >
                                    <span
                                        className={`flex-1 truncate text-sm ${
                                            hidden ? 'text-neutral-400 line-through' : 'text-neutral-100'
                                        }`}
                                    >
                                        {labelOf(key)}
                                        {isExtra && <span className={'ml-1.5 text-2xs text-neutral-400'}>link</span>}
                                    </span>
                                    {categories.length > 1 && (
                                        <select
                                            aria-label={'Move to another category'}
                                            value={''}
                                            onChange={(e) =>
                                                e.currentTarget.value &&
                                                sendItem(index, key, Number(e.currentTarget.value) - 1)
                                            }
                                            className={
                                                'w-8 rounded-md border border-transparent bg-transparent py-0.5 text-xs text-neutral-400 hover:bg-neutral-600'
                                            }
                                            title={'Move to another category'}
                                        >
                                            <option value={''}>⇄</option>
                                            {categories.map((c, at) =>
                                                at === index ? null : (
                                                    <option key={c.id} value={at + 1}>
                                                        {c.title}
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    )}
                                    <button
                                        type={'button'}
                                        className={small}
                                        disabled={i === 0}
                                        onClick={() => moveItem(index, key, -1)}
                                        aria-label={'Move up'}
                                    >
                                        <ArrowUpIcon className={'h-4 w-4'} />
                                    </button>
                                    <button
                                        type={'button'}
                                        className={small}
                                        disabled={i === category.items.length - 1}
                                        onClick={() => moveItem(index, key, 1)}
                                        aria-label={'Move down'}
                                    >
                                        <ArrowDownIcon className={'h-4 w-4'} />
                                    </button>
                                    {isExtra ? (
                                        <button
                                            type={'button'}
                                            className={small}
                                            onClick={() => removeExtra(key)}
                                            aria-label={'Remove the link'}
                                        >
                                            <TrashIcon className={'h-4 w-4'} />
                                        </button>
                                    ) : (
                                        <button
                                            type={'button'}
                                            className={small}
                                            onClick={() => toggle(key)}
                                            aria-label={hidden ? 'Show' : 'Hide'}
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
            ))}
            {loose.length > 0 && (
                <div className={'rounded-lg border border-dashed border-neutral-400 p-3'}>
                    <p className={'mb-2 text-xs font-medium text-neutral-300'}>
                        In no category (shown under &ldquo;More&rdquo;)
                    </p>
                    <div className={'flex flex-wrap gap-1.5'}>
                        {loose.map((key) => (
                            <button
                                key={key}
                                type={'button'}
                                disabled={categories.length === 0}
                                onClick={() =>
                                    save(categories.map((c, i) => (i === 0 ? { ...c, items: [...c.items, key] } : c)))
                                }
                                className={
                                    'rounded-full border border-neutral-500 px-2.5 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600'
                                }
                            >
                                + {labelOf(key)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className={'flex gap-2'}>
                <input
                    value={title}
                    maxLength={30}
                    placeholder={'New category, like "Infrastructure"'}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                    className={`flex-1 ${input}`}
                />
                <button
                    type={'button'}
                    onClick={addCategory}
                    className={
                        'inline-flex items-center rounded-lg border border-neutral-500 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-600'
                    }
                >
                    <PlusIcon className={'mr-1 h-4 w-4'} />
                    Category
                </button>
            </div>
            <div className={'rounded-lg border border-dashed border-neutral-400 p-3'}>
                <p className={'mb-2 text-sm font-medium text-neutral-100'}>Add a link</p>
                <div className={'space-y-2'}>
                    <input
                        value={label}
                        maxLength={40}
                        placeholder={'Name'}
                        onChange={(e) => setLabel(e.currentTarget.value)}
                        className={`w-full ${input}`}
                    />
                    <input
                        value={url}
                        placeholder={
                            id === 'server'
                                ? 'https://example.com or /server/{id}/files'
                                : 'https://example.com or /account'
                        }
                        onChange={(e) => setUrl(e.currentTarget.value)}
                        className={`w-full font-mono text-xs ${input}`}
                    />
                    <div className={'flex items-center gap-2'}>
                        <select
                            value={target}
                            onChange={(e) => setTarget(e.currentTarget.value)}
                            className={`flex-1 ${input}`}
                        >
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.title}
                                </option>
                            ))}
                        </select>
                        <button
                            type={'button'}
                            onClick={addLink}
                            disabled={categories.length === 0}
                            className={
                                'inline-flex items-center rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-snow'
                            }
                        >
                            <PlusIcon className={'mr-1 h-4 w-4'} />
                            Add
                        </button>
                    </div>
                    {error && <p className={'text-xs text-red-600'}>{error}</p>}
                    {id === 'server' && (
                        <p className={'text-2xs text-neutral-400'}>
                            {'{id}'} and {'{uuid}'} in the address stand for the server.
                        </p>
                    )}
                </div>
            </div>
            {(layout.categories.length > 0 || layout.hidden.length > 0 || layout.extra.length > 0) && (
                <button
                    type={'button'}
                    className={'text-xs text-primary-600'}
                    onClick={() => onChange({ ...layout, categories: [], hidden: [], extra: [] })}
                >
                    Reset this sidebar to its default
                </button>
            )}
        </div>
    );
};

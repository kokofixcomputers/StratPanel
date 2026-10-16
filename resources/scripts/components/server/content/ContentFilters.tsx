import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { SearchIcon, XIcon } from '@heroicons/react/solid';
import Input from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import { CategoryTag, GameVersionTag, LoaderTag, loadersOf, prettyTag } from '@/lib/modrinth';
import { browsesKind, loadTags, sourceLabel } from '@/lib/contentSource';
import TagIcon from '@/components/server/content/TagIcon';
import useContentQuery, { ContentQuery, KINDS } from '@/components/server/content/useContentQuery';
import useServerVersion from '@/components/server/content/useServerVersion';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className={'border-t border-neutral-500 px-1 py-4 first:border-t-0 first:pt-1'}>
        <p className={'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>{title}</p>
        {children}
    </div>
);

/** How many filters are on, the page shows it on the button that opens them on narrow screens. */
export const activeFilters = (query: ContentQuery, serverVersion: string): number =>
    query.categories.length +
    (query.loader ? 1 : 0) +
    (query.version !== serverVersion ? 1 : 0) +
    (query.query ? 1 : 0);

const MAX_TAGS = 8;

/**
 * The search and the filters of the Content page: the words to look for, the loader, the Minecraft version and the
 * tags Modrinth puts its projects in. They are kept in the address, see useContentQuery.
 */
export default () => {
    const serverVersion = useServerVersion();
    const { query, update } = useContentQuery(serverVersion);
    const [text, setText] = useState(query.query);
    const [categories, setCategories] = useState<CategoryTag[] | null>(null);
    const [loaders, setLoaders] = useState<LoaderTag[]>([]);
    const [versions, setVersions] = useState<GameVersionTag[]>([]);
    const [snapshots, setSnapshots] = useState(false);
    const [expanded, setExpanded] = useState<string[]>([]);
    const [failed, setFailed] = useState(false);

    // The tags are the ones of the site that is chosen, CurseForge's categories are not Modrinth's.
    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        loadTags(query.source)
            .then(({ categories: c, loaders: l, versions: v }) => {
                if (cancelled) return;
                setCategories(c);
                setLoaders(l);
                setVersions(v);
            })
            .catch(() => !cancelled && setFailed(true));

        return () => {
            cancelled = true;
        };
    }, [query.source]);

    // The box is typed in, the address is changed once typing stops. Changes of the address (clearing the filters)
    // come back into the box.
    useEffect(() => setText(query.query), [query.query]);
    useEffect(() => {
        if (text.trim() === query.query) return;

        const timer = setTimeout(() => update({ query: text }), 350);

        return () => clearTimeout(timer);
    }, [text]);

    const kind = query.kind;
    const source = query.source;
    const browsing = browsesKind(source, kind) && query.view === 'browse';
    const unit = KINDS.find((k) => k.id === kind)!.unit;
    const usesLoader = kind === 'plugin' || kind === 'mod' || kind === 'modpack';

    const groups = useMemo(() => {
        const wanted = (categories || []).filter((tag) => tag.project_type === kind);
        const order: string[] = [];
        wanted.forEach((tag) => !order.includes(tag.header) && order.push(tag.header));

        return order.map((header) => ({ header, tags: wanted.filter((tag) => tag.header === header) }));
    }, [categories, kind]);

    const versionOptions = useMemo(() => {
        const list = versions.filter((v) => snapshots || v.version_type === 'release').map((v) => v.version);
        // The chosen version stays in the list even when it is a snapshot that is hidden.
        if (query.version && !list.includes(query.version)) list.unshift(query.version);

        return list;
    }, [versions, snapshots, query.version]);

    const filtered = activeFilters(query, serverVersion) > 0 || query.page > 1;

    if (!browsesKind(source, kind)) {
        return (
            <p className={'px-2 py-3 text-sm text-neutral-300'}>
                Worlds are not on Modrinth, they come from a link or an upload. There is nothing to filter here.
            </p>
        );
    }

    return (
        <div>
            <Section title={'Search'}>
                <div className={'relative'}>
                    <SearchIcon
                        className={
                            'pointer-events-none absolute left-3 top-0 bottom-0 my-auto h-5 w-5 text-neutral-400'
                        }
                    />
                    <Input
                        type={'text'}
                        value={text}
                        placeholder={`Search ${unit}...`}
                        aria-label={`Search ${unit}`}
                        style={{ paddingLeft: '2.5rem', paddingRight: '2.25rem' }}
                        onChange={(e) => setText(e.currentTarget.value)}
                    />
                    {text && (
                        <button
                            type={'button'}
                            aria-label={'Clear the search'}
                            onClick={() => {
                                setText('');
                                update({ query: '' });
                            }}
                            className={
                                'absolute right-2.5 top-0 bottom-0 my-auto h-5 w-5 text-neutral-400 hover:text-neutral-200'
                            }
                        >
                            <XIcon className={'h-5 w-5'} />
                        </button>
                    )}
                </div>
                {!browsing && (
                    <p className={'mt-2 px-1 text-xs text-neutral-400'}>
                        The search and filters are used when browsing.
                    </p>
                )}
            </Section>

            {failed && (
                <p className={'px-2 py-3 text-xs text-red-600'}>
                    The filters could not be loaded from {sourceLabel(source)}, searching still works.
                </p>
            )}

            {usesLoader && loadersOf(loaders, kind).length > 0 && (
                <Section title={kind === 'plugin' ? 'Platform' : 'Loader'}>
                    <div className={'space-y-0.5'}>
                        {[{ name: '', icon: '' } as LoaderTag, ...loadersOf(loaders, kind)].map((loader) => {
                            const active = query.loader === loader.name;

                            return (
                                <button
                                    key={loader.name || 'any'}
                                    type={'button'}
                                    aria-pressed={active}
                                    onClick={() => update({ loader: loader.name })}
                                    className={classNames(
                                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-150',
                                        active
                                            ? 'bg-primary-50 font-medium text-primary-700'
                                            : 'text-neutral-300 hover:bg-neutral-600'
                                    )}
                                >
                                    <TagIcon svg={loader.icon} />
                                    {loader.name
                                        ? prettyTag(loader.name)
                                        : kind === 'plugin'
                                        ? 'Any platform'
                                        : 'Any loader'}
                                </button>
                            );
                        })}
                    </div>
                </Section>
            )}

            <Section title={'Minecraft version'}>
                <Select
                    value={query.version}
                    aria-label={'Minecraft version'}
                    onChange={(e) => update({ version: e.currentTarget.value })}
                >
                    <option value={''}>Any version</option>
                    {versionOptions.map((v) => (
                        <option key={v} value={v}>
                            {v}
                            {v === serverVersion ? ' (this server)' : ''}
                        </option>
                    ))}
                </Select>
                <label className={'mt-2 flex cursor-pointer items-center px-1 text-xs text-neutral-300'}>
                    <input
                        type={'checkbox'}
                        checked={snapshots}
                        onChange={(e) => setSnapshots(e.currentTarget.checked)}
                        className={'mr-2'}
                    />
                    Show snapshots and betas
                </label>
            </Section>

            {source === 'modrinth' && (kind === 'mod' || kind === 'modpack') && (
                <Section title={'Environment'}>
                    <label className={'flex cursor-pointer items-start px-1 text-sm text-neutral-300'}>
                        <input
                            type={'checkbox'}
                            checked={query.serverSide}
                            onChange={(e) => update({ serverSide: e.currentTarget.checked })}
                            className={'mr-2 mt-1'}
                        />
                        <span>
                            Works on servers
                            <span className={'block text-xs text-neutral-400'}>
                                Hides what only runs on a player&apos;s computer.
                            </span>
                        </span>
                    </label>
                </Section>
            )}

            {groups.map((group) => {
                const open = expanded.includes(group.header);
                const tags = open ? group.tags : group.tags.slice(0, MAX_TAGS);

                return (
                    <Section key={group.header} title={group.header}>
                        <div className={'flex flex-wrap gap-1.5'}>
                            {tags.map((tag) => {
                                const active = query.categories.includes(tag.name);

                                return (
                                    <button
                                        key={tag.name}
                                        type={'button'}
                                        aria-pressed={active}
                                        onClick={() =>
                                            update({
                                                categories: active
                                                    ? query.categories.filter((c) => c !== tag.name)
                                                    : [...query.categories, tag.name],
                                            })
                                        }
                                        className={classNames(
                                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                                            active
                                                ? 'border-primary-600 bg-primary-600 text-white'
                                                : 'border-neutral-500 bg-white text-neutral-300 hover:bg-neutral-600'
                                        )}
                                    >
                                        <TagIcon svg={tag.icon} size={14} />
                                        {tag.label || prettyTag(tag.name)}
                                    </button>
                                );
                            })}
                        </div>
                        {group.tags.length > MAX_TAGS && (
                            <button
                                type={'button'}
                                onClick={() =>
                                    setExpanded((current) =>
                                        open ? current.filter((h) => h !== group.header) : [...current, group.header]
                                    )
                                }
                                className={'mt-2 px-1 text-xs font-medium text-primary-600 hover:underline'}
                            >
                                {open ? 'Show fewer' : `Show all ${group.tags.length}`}
                            </button>
                        )}
                    </Section>
                );
            })}

            {filtered && (
                <div className={'border-t border-neutral-500 px-1 pt-4'}>
                    <button
                        type={'button'}
                        onClick={() => {
                            setText('');
                            update({ query: '', categories: [], loader: '', version: serverVersion });
                        }}
                        className={
                            'w-full rounded-lg border border-neutral-500 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-600'
                        }
                    >
                        Clear all filters
                    </button>
                </div>
            )}
        </div>
    );
};

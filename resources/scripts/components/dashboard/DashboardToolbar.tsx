import React from 'react';
import classNames from 'classnames';
import { FolderAddIcon, SearchIcon, StarIcon, XIcon } from '@heroicons/react/outline';
import { ListFilters, noFilters, SortKey, StatusGroup } from '@/lib/dashboardList';

const field =
    'rounded-lg border border-neutral-500 bg-white text-sm text-neutral-50 placeholder-neutral-400 transition-colors focus:border-primary-600 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-primary-600/30';

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
        type={'button'}
        aria-pressed={active}
        onClick={onClick}
        className={classNames(
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-primary-600/30',
            active
                ? 'border-primary-600 bg-primary-50 text-primary-700'
                : 'border-neutral-500 bg-white text-neutral-300 hover:border-neutral-400 hover:text-neutral-50'
        )}
    >
        {children}
    </button>
);

const STATUSES: [StatusGroup | 'all', string][] = [
    ['all', 'All'],
    ['online', 'Online'],
    ['offline', 'Offline'],
    ['other', 'Other'],
];

/** Search, filters and sorting of the list of servers. */
export default ({
    filters,
    onChange,
    sort,
    onSort,
    nodes,
    hasShared,
    canOrganize,
    onNewFolder,
}: {
    filters: ListFilters;
    onChange: (filters: ListFilters) => void;
    sort: SortKey;
    onSort: (sort: SortKey) => void;
    nodes: string[];
    hasShared: boolean;
    canOrganize: boolean;
    onNewFolder: () => void;
}) => {
    const set = (change: Partial<ListFilters>) => onChange({ ...filters, ...change });

    return (
        <div className={'mb-5 space-y-3'}>
            <div className={'flex flex-wrap items-center gap-3'}>
                <div className={'relative min-w-[14rem] flex-1'}>
                    <SearchIcon
                        className={
                            'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400'
                        }
                    />
                    <input
                        type={'text'}
                        value={filters.query}
                        placeholder={'Search by name, description, address or node'}
                        aria-label={'Search servers'}
                        autoComplete={'off'}
                        className={classNames(field, 'w-full py-2.5 pl-10 pr-9')}
                        onChange={(e) => set({ query: e.currentTarget.value })}
                        onKeyDown={(e) => e.key === 'Escape' && set({ query: '' })}
                    />
                    {filters.query !== '' && (
                        <button
                            type={'button'}
                            aria-label={'Clear the search'}
                            className={
                                'absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-50'
                            }
                            onClick={() => set({ query: '' })}
                        >
                            <XIcon className={'h-4 w-4'} />
                        </button>
                    )}
                </div>
                <select
                    aria-label={'Sort servers'}
                    value={sort}
                    className={classNames(field, 'py-2.5 pl-3 pr-8')}
                    onChange={(e) => onSort(e.currentTarget.value as SortKey)}
                >
                    <option value={'name'}>Sort by name</option>
                    <option value={'status'}>Running first</option>
                </select>
                {canOrganize && (
                    <button
                        type={'button'}
                        onClick={onNewFolder}
                        className={classNames(field, 'inline-flex items-center px-3 py-2.5 hover:border-neutral-400')}
                    >
                        <FolderAddIcon className={'mr-2 h-4 w-4'} />
                        New folder
                    </button>
                )}
            </div>
            <div className={'flex flex-wrap items-center gap-2'}>
                {STATUSES.map(([value, label]) => (
                    <Chip key={value} active={filters.status === value} onClick={() => set({ status: value })}>
                        {label}
                    </Chip>
                ))}
                {canOrganize && (
                    <Chip active={filters.starred} onClick={() => set({ starred: !filters.starred })}>
                        <StarIcon className={'mr-1 h-3.5 w-3.5'} />
                        Starred
                    </Chip>
                )}
                {hasShared && (
                    <select
                        aria-label={'Filter by ownership'}
                        value={filters.role}
                        className={classNames(field, 'py-1 pl-3 pr-8 text-xs')}
                        onChange={(e) => set({ role: e.currentTarget.value as ListFilters['role'] })}
                    >
                        <option value={'all'}>Owned and shared</option>
                        <option value={'owned'}>Owned by me</option>
                        <option value={'shared'}>Shared with me</option>
                    </select>
                )}
                {nodes.length > 1 && (
                    <select
                        aria-label={'Filter by node'}
                        value={filters.node}
                        className={classNames(field, 'py-1 pl-3 pr-8 text-xs')}
                        onChange={(e) => set({ node: e.currentTarget.value })}
                    >
                        <option value={''}>All nodes</option>
                        {nodes.map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                )}
                {(filters.status !== 'all' || filters.node !== '' || filters.role !== 'all' || filters.starred) && (
                    <button
                        type={'button'}
                        className={'text-xs font-medium text-primary-600 hover:underline'}
                        onClick={() => onChange({ ...noFilters, query: filters.query })}
                    >
                        Reset filters
                    </button>
                )}
            </div>
        </div>
    );
};

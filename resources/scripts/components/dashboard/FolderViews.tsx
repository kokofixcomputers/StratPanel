import React, { useState } from 'react';
import classNames from 'classnames';
import {
    ArrowDownIcon,
    ArrowLeftIcon,
    ArrowUpIcon,
    DotsHorizontalIcon,
    FolderIcon,
    PencilIcon,
    TrashIcon,
} from '@heroicons/react/outline';
import DropdownMenu, { DropdownButtonRow } from '@/components/elements/DropdownMenu';
import { DashboardFolder } from '@/api/dashboardLayout';
import { DotTone, FolderSummary } from '@/lib/dashboardList';

const TONES: Record<DotTone, string> = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    other: 'bg-amber-500',
    empty: 'bg-neutral-400',
};

/** The coloured dot of a state: green online, red offline, amber for anything else. */
export const StatusDot = ({ tone, title, className }: { tone: DotTone; title?: string; className?: string }) => (
    <span
        title={title}
        aria-label={title}
        className={classNames('inline-block h-2 w-2 flex-shrink-0 rounded-full', TONES[tone], className)}
    />
);

export const summaryText = (s: FolderSummary): string =>
    [s.online && `${s.online} online`, s.offline && `${s.offline} offline`, s.other && `${s.other} other`]
        .filter(Boolean)
        .join(', ') || 'Empty';

/** The folder actions: rename, move, delete. */
export const FolderMenu = ({
    name,
    onRename,
    onDelete,
    onMoveUp,
    onMoveDown,
}: {
    name: string;
    onRename: () => void;
    onDelete: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
}) => (
    <DropdownMenu
        renderToggle={(onClick) => (
            <button
                type={'button'}
                aria-label={`Options of the folder ${name}`}
                className={'fx rounded-md p-1 text-neutral-400 hover:text-neutral-50'}
                onClick={onClick}
            >
                <DotsHorizontalIcon className={'h-5 w-5'} />
            </button>
        )}
    >
        <div className={'w-48 p-1'}>
            <DropdownButtonRow type={'button'} onClick={onRename}>
                <PencilIcon className={'mr-2 h-4 w-4'} />
                Rename
            </DropdownButtonRow>
            {onMoveUp && (
                <DropdownButtonRow type={'button'} onClick={onMoveUp}>
                    <ArrowUpIcon className={'mr-2 h-4 w-4'} />
                    Move earlier
                </DropdownButtonRow>
            )}
            {onMoveDown && (
                <DropdownButtonRow type={'button'} onClick={onMoveDown}>
                    <ArrowDownIcon className={'mr-2 h-4 w-4'} />
                    Move later
                </DropdownButtonRow>
            )}
            <DropdownButtonRow type={'button'} danger onClick={onDelete}>
                <TrashIcon className={'mr-2 h-4 w-4'} />
                Delete folder
            </DropdownButtonRow>
        </div>
    </DropdownMenu>
);

/** A thing that takes a dragged server. */
const useDropTarget = (onDrop: (uuid: string) => void) => {
    const [over, setOver] = useState(false);

    return {
        over,
        props: {
            onDragOver: (e: React.DragEvent) => {
                if (!e.dataTransfer.types.includes('text/x-stratosphere-server')) return;
                e.preventDefault();
                setOver(true);
            },
            onDragLeave: () => setOver(false),
            onDrop: (e: React.DragEvent) => {
                setOver(false);
                const uuid = e.dataTransfer.getData('text/x-stratosphere-server');
                if (uuid) {
                    e.preventDefault();
                    onDrop(uuid);
                }
            },
        },
    };
};

const Chip = ({
    active,
    onClick,
    onDropServer,
    children,
}: {
    active: boolean;
    onClick: () => void;
    onDropServer?: (uuid: string) => void;
    children: React.ReactNode;
}) => {
    const drop = useDropTarget(onDropServer ?? (() => undefined));

    return (
        <button
            type={'button'}
            aria-pressed={active}
            onClick={onClick}
            {...(onDropServer ? drop.props : {})}
            className={classNames(
                'fx inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-primary-600/30',
                active
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-500 bg-white text-neutral-300 hover:border-neutral-400 hover:text-neutral-50',
                drop.over && 'ring-2 ring-primary-600/50'
            )}
        >
            {children}
        </button>
    );
};

export interface FolderEntry {
    folder: DashboardFolder;
    summary: FolderSummary;
    total: number;
}

/** The folders as chips: "All servers", one for each folder with its dot and count, "Not in a folder". Opening one shows only its servers. */
export const FolderChips = ({
    folders,
    looseCount,
    open,
    onOpen,
    onDropServer,
    menu,
}: {
    folders: FolderEntry[];
    looseCount: number;
    // The folder that is open: its id, "none" for the servers in no folder, null for all.
    open: number | 'none' | null;
    onOpen: (folder: number | 'none' | null) => void;
    onDropServer: (uuid: string, folder: number | null) => void;
    // The actions of the open folder.
    menu: React.ReactNode;
}) => (
    <div className={'flex flex-wrap items-center gap-2'} role={'group'} aria-label={'Folders'}>
        <Chip active={open === null} onClick={() => onOpen(null)}>
            <FolderIcon className={'h-3.5 w-3.5'} />
            All servers
        </Chip>
        {folders.map(({ folder, summary, total }) => (
            <Chip
                key={folder.id}
                active={open === folder.id}
                onClick={() => onOpen(open === folder.id ? null : folder.id)}
                onDropServer={(uuid) => onDropServer(uuid, folder.id)}
            >
                <StatusDot tone={summary.tone} title={summaryText(summary)} />
                {folder.name}
                <span className={'text-neutral-400'}>{total}</span>
            </Chip>
        ))}
        {folders.length > 0 && (
            <Chip
                active={open === 'none'}
                onClick={() => onOpen(open === 'none' ? null : 'none')}
                onDropServer={(uuid) => onDropServer(uuid, null)}
            >
                Not in a folder
                <span className={'text-neutral-400'}>{looseCount}</span>
            </Chip>
        )}
        {menu}
    </div>
);

/** A folder drawn like a server: the same card, with the dot and the counts. A click opens it. */
export const FolderCard = ({
    entry,
    onOpen,
    onDropServer,
}: {
    entry: FolderEntry;
    onOpen: () => void;
    onDropServer: (uuid: string) => void;
}) => {
    const drop = useDropTarget(onDropServer);
    const { folder, summary, total } = entry;

    return (
        <button
            type={'button'}
            onClick={onOpen}
            {...drop.props}
            className={classNames(
                'hover-card group relative flex w-full items-center overflow-hidden rounded-xl border border-neutral-500 bg-white p-4 text-left shadow transition-all duration-150 hover:border-neutral-400 hover:shadow-md',
                drop.over && 'ring-2 ring-primary-600/50'
            )}
        >
            <div
                className={
                    'icon mr-4 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 p-3 text-primary-600'
                }
            >
                <FolderIcon className={'h-6 w-6'} />
            </div>
            <div className={'min-w-0 flex-1'}>
                <p className={'truncate text-base font-semibold text-neutral-50'}>{folder.name}</p>
                <p className={'mt-0.5 flex items-center gap-2 text-sm text-neutral-400'}>
                    <StatusDot tone={summary.tone} />
                    {total === 1 ? '1 server' : `${total} servers`}
                    {total > 0 && <span className={'truncate text-xs'}>{summaryText(summary)}</span>}
                </p>
            </div>
        </button>
    );
};

/** The top of an open folder in the card style: the way back, its name, its dot and its actions. */
export const FolderHeader = ({
    name,
    summary,
    total,
    onBack,
    menu,
}: {
    name: string;
    summary?: FolderSummary;
    total: number;
    onBack: () => void;
    menu?: React.ReactNode;
}) => (
    <div className={'mb-4 flex items-center gap-3'}>
        <button
            type={'button'}
            onClick={onBack}
            className={
                'fx inline-flex items-center gap-1.5 rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-600'
            }
        >
            <ArrowLeftIcon className={'h-4 w-4'} />
            All servers
        </button>
        <div className={'flex min-w-0 items-center gap-2'}>
            <FolderIcon className={'h-5 w-5 flex-shrink-0 text-primary-600'} />
            <h2 className={'truncate text-lg font-semibold text-neutral-50'}>{name}</h2>
            {summary && <StatusDot tone={summary.tone} title={summaryText(summary)} />}
            <span className={'text-sm text-neutral-400'}>{total}</span>
        </div>
        {menu}
    </div>
);

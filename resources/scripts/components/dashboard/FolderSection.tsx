import React, { useState } from 'react';
import classNames from 'classnames';
import {
    ArrowDownIcon,
    ArrowUpIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    DotsHorizontalIcon,
    FolderIcon,
    PencilIcon,
    TrashIcon,
} from '@heroicons/react/outline';
import DropdownMenu, { DropdownButtonRow } from '@/components/elements/DropdownMenu';
import { DashboardFolder } from '@/api/dashboardLayout';

/**
 * A folder of servers on the dashboard: a header that folds it and takes dropped servers, and the rows below it. The "folder" of
 * null is the servers that are in none, which only gets a header when there are folders to tell it apart from.
 */
export default ({
    folder,
    count,
    collapsed,
    onToggle,
    onDropServer,
    onRename,
    onDelete,
    onMoveUp,
    onMoveDown,
    showHeader,
    emptyHint,
    children,
}: {
    folder: DashboardFolder | null;
    count: number;
    collapsed: boolean;
    onToggle: () => void;
    onDropServer: (uuid: string) => void;
    onRename?: () => void;
    onDelete?: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    showHeader: boolean;
    emptyHint?: string;
    children: React.ReactNode;
}) => {
    const [over, setOver] = useState(false);
    const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;

    return (
        <section
            className={classNames(
                'mb-6 rounded-xl transition-colors',
                over && 'bg-primary-50 ring-2 ring-primary-600/40'
            )}
            onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('text/x-stratosphere-server')) return;
                e.preventDefault();
                setOver(true);
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
            }}
            onDrop={(e) => {
                setOver(false);
                const uuid = e.dataTransfer.getData('text/x-stratosphere-server');
                if (uuid) {
                    e.preventDefault();
                    onDropServer(uuid);
                }
            }}
        >
            {showHeader && (
                <div className={'mb-3 flex items-center gap-2'}>
                    <button
                        type={'button'}
                        aria-expanded={!collapsed}
                        className={'flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 text-left'}
                        onClick={onToggle}
                    >
                        <Chevron className={'h-4 w-4 flex-shrink-0 text-neutral-400'} />
                        <FolderIcon className={'h-5 w-5 flex-shrink-0 text-primary-600'} />
                        <span className={'truncate text-sm font-semibold text-neutral-50'}>
                            {folder ? folder.name : 'Not in a folder'}
                        </span>
                        <span className={'flex-shrink-0 text-xs text-neutral-400'}>{count}</span>
                    </button>
                    {folder && (
                        <DropdownMenu
                            renderToggle={(onClick) => (
                                <button
                                    type={'button'}
                                    aria-label={`Options of the folder ${folder.name}`}
                                    className={'rounded-md p-1 text-neutral-400 hover:text-neutral-50'}
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
                                        Move up
                                    </DropdownButtonRow>
                                )}
                                {onMoveDown && (
                                    <DropdownButtonRow type={'button'} onClick={onMoveDown}>
                                        <ArrowDownIcon className={'mr-2 h-4 w-4'} />
                                        Move down
                                    </DropdownButtonRow>
                                )}
                                <DropdownButtonRow type={'button'} danger onClick={onDelete}>
                                    <TrashIcon className={'mr-2 h-4 w-4'} />
                                    Delete folder
                                </DropdownButtonRow>
                            </div>
                        </DropdownMenu>
                    )}
                </div>
            )}
            {!collapsed &&
                (count > 0 ? (
                    <div className={'server-list'}>{children}</div>
                ) : emptyHint ? (
                    <p
                        className={
                            'rounded-xl border border-dashed border-neutral-500 px-4 py-6 text-center text-sm text-neutral-400'
                        }
                    >
                        {emptyHint}
                    </p>
                ) : null)}
        </section>
    );
};

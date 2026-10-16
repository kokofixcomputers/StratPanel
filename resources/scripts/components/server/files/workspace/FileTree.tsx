import React, { useEffect, useRef, useState } from 'react';
import {
    ChevronRightIcon,
    DocumentTextIcon,
    FolderIcon,
    FolderOpenIcon,
    RefreshIcon,
    DocumentAddIcon,
    FolderAddIcon,
    ArrowsExpandIcon,
} from '@heroicons/react/solid';
import { checkName, TreeNode, TreeRow } from '@/lib/workspace';

export interface Editing {
    kind: 'new-file' | 'new-folder' | 'rename';
    // The folder the new thing is made in, or the folder the renamed thing is in.
    parent: string;
    // The thing that is renamed.
    path?: string;
}

const ToolButton = ({
    title,
    onClick,
    children,
}: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
}) => (
    <button
        type={'button'}
        title={title}
        aria-label={title}
        onClick={onClick}
        className={'rounded p-1 text-neutral-300 hover:bg-neutral-600 hover:text-neutral-50'}
    >
        {children}
    </button>
);

const INDENT = 14;

const NameInput = ({
    initial,
    taken,
    depth,
    icon,
    onCommit,
    onCancel,
}: {
    initial: string;
    taken: string[];
    depth: number;
    icon: React.ReactNode;
    onCommit: (name: string) => void;
    onCancel: () => void;
}) => {
    const input = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState(initial);
    const problem = value !== initial ? checkName(value, taken) : null;

    useEffect(() => {
        input.current?.focus();
        // A file is renamed without its extension selected, like in every editor.
        const dot = initial.lastIndexOf('.');
        input.current?.setSelectionRange(0, dot > 0 ? dot : initial.length);
    }, []);

    return (
        <div style={{ paddingLeft: 8 + depth * INDENT + 16 }} className={'relative py-0.5 pr-2'}>
            <div className={'flex items-center'}>
                <span className={'mr-1.5 flex-shrink-0'}>{icon}</span>
                <input
                    ref={input}
                    value={value}
                    onChange={(e) => setValue(e.currentTarget.value)}
                    onBlur={onCancel}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onCancel();
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            // Renaming to the same name changes nothing.
                            if (value === initial) return onCancel();
                            if (!checkName(value, taken)) onCommit(value.trim());
                        }
                    }}
                    spellCheck={false}
                    className={`min-w-0 flex-1 rounded border bg-white px-1.5 py-0.5 text-sm text-neutral-100 outline-none ${
                        problem ? 'border-red-400' : 'border-primary-500'
                    }`}
                />
            </div>
            {problem && (
                <p className={'mt-0.5 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700'} role={'alert'}>
                    {problem}
                </p>
            )}
        </div>
    );
};

export const NodeIcon = ({ node, open }: { node: TreeNode; open?: boolean }) =>
    node.isDirectory ? (
        open ? (
            <FolderOpenIcon className={'h-4 w-4 text-amber-500'} />
        ) : (
            <FolderIcon className={'h-4 w-4 text-amber-500'} />
        )
    ) : (
        <DocumentTextIcon className={'h-4 w-4 text-neutral-400'} />
    );

interface Props {
    rows: TreeRow[];
    rootName: string;
    selected: string | null;
    active: string | null;
    editing: Editing | null;
    // Names that are in a folder, for the checks of a new name.
    namesIn: (directory: string) => string[];
    rootLoading: boolean;
    rootError?: string;
    canCreate: boolean;
    onToggle: (node: TreeNode) => void;
    onSelect: (path: string | null) => void;
    onOpen: (node: TreeNode) => void;
    onMenu: (event: React.MouseEvent, node: TreeNode | null) => void;
    onNewFile: () => void;
    onNewFolder: () => void;
    onRefresh: () => void;
    onCollapseAll: () => void;
    onCommit: (name: string) => void;
    onCancelEdit: () => void;
    onRetry: () => void;
}

/** The explorer: the folders of the server that are open, as a tree, with what can be done to them in its toolbar and context menu. */
export default (props: Props) => {
    const { rows, editing } = props;

    const header = (
        <div className={'flex items-center justify-between border-b border-neutral-500 px-3 py-2'}>
            <span className={'truncate text-xs font-semibold uppercase tracking-wide text-neutral-300'}>Explorer</span>
            <div className={'flex items-center gap-0.5'}>
                {props.canCreate && (
                    <>
                        <ToolButton title={'New file'} onClick={props.onNewFile}>
                            <DocumentAddIcon className={'h-4 w-4'} />
                        </ToolButton>
                        <ToolButton title={'New folder'} onClick={props.onNewFolder}>
                            <FolderAddIcon className={'h-4 w-4'} />
                        </ToolButton>
                    </>
                )}
                <ToolButton title={'Refresh'} onClick={props.onRefresh}>
                    <RefreshIcon className={`h-4 w-4 ${props.rootLoading ? 'animate-spin' : ''}`} />
                </ToolButton>
                <ToolButton title={'Collapse all folders'} onClick={props.onCollapseAll}>
                    <ArrowsExpandIcon className={'h-4 w-4 rotate-45'} />
                </ToolButton>
            </div>
        </div>
    );

    const renderEditor = (depth: number, row?: TreeRow) => {
        if (!editing) return null;
        const renaming = editing.kind === 'rename';

        return (
            <NameInput
                key={`edit:${editing.kind}:${editing.path ?? editing.parent}`}
                initial={renaming && row ? row.node.name : ''}
                taken={props.namesIn(editing.parent).filter((name) => !(renaming && row && name === row.node.name))}
                depth={depth}
                icon={
                    <NodeIcon
                        node={
                            renaming && row
                                ? row.node
                                : { path: '', name: '', isDirectory: editing.kind === 'new-folder', size: 0 }
                        }
                    />
                }
                onCommit={props.onCommit}
                onCancel={props.onCancelEdit}
            />
        );
    };

    const items: React.ReactNode[] = [];
    // A new file or folder in the root is the first thing in the list.
    if (editing && editing.kind !== 'rename' && editing.parent === '/') items.push(renderEditor(0));

    rows.forEach((row) => {
        const { node } = row;
        if (editing?.kind === 'rename' && editing.path === node.path) {
            items.push(renderEditor(row.depth, row));
        } else {
            items.push(
                <div
                    key={node.path}
                    role={'treeitem'}
                    aria-expanded={node.isDirectory ? row.expanded : undefined}
                    aria-selected={props.selected === node.path}
                    title={node.path}
                    onClick={() => {
                        props.onSelect(node.path);
                        if (node.isDirectory) props.onToggle(node);
                        else props.onOpen(node);
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        props.onSelect(node.path);
                        props.onMenu(e, node);
                    }}
                    style={{ paddingLeft: 8 + row.depth * INDENT }}
                    className={`flex cursor-pointer select-none items-center py-1 pr-2 text-sm ${
                        props.active === node.path
                            ? 'bg-primary-50 text-primary-700'
                            : props.selected === node.path
                            ? 'bg-neutral-600 text-neutral-50'
                            : 'text-neutral-200 hover:bg-neutral-600'
                    }`}
                >
                    <span className={'mr-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center'}>
                        {node.isDirectory && (
                            <ChevronRightIcon
                                className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-100 ${
                                    row.expanded ? 'rotate-90' : ''
                                }`}
                            />
                        )}
                    </span>
                    <span className={'mr-1.5 flex-shrink-0'}>
                        <NodeIcon node={node} open={row.expanded} />
                    </span>
                    <span className={'truncate'}>{node.name}</span>
                    {row.loading && <span className={'ml-2 text-xs text-neutral-400'}>…</span>}
                </div>
            );
        }

        if (node.isDirectory && row.expanded) {
            if (editing && editing.kind !== 'rename' && editing.parent === node.path) {
                items.push(renderEditor(row.depth + 1));
            }
        }
    });

    return (
        <div className={'flex h-full min-h-0 flex-col bg-white'}>
            {header}
            <div
                role={'tree'}
                className={'min-h-0 flex-1 overflow-y-auto py-1'}
                // Clicking on empty space or right clicking on it is about the root folder.
                onClick={(e) => e.target === e.currentTarget && props.onSelect(null)}
                onContextMenu={(e) => {
                    if (e.target === e.currentTarget) {
                        e.preventDefault();
                        props.onMenu(e, null);
                    }
                }}
            >
                <div className={'truncate px-3 pb-1 pt-0.5 text-xs font-medium text-neutral-300'} title={'/'}>
                    {props.rootName}
                </div>
                {props.rootError ? (
                    <div className={'px-3 py-2 text-sm text-red-600'}>
                        <p>{props.rootError}</p>
                        <button type={'button'} onClick={props.onRetry} className={'mt-1 text-primary-600 underline'}>
                            Try again
                        </button>
                    </div>
                ) : rows.length === 0 && !props.rootLoading && !editing ? (
                    <p className={'px-3 py-2 text-sm text-neutral-400'}>This server has no files.</p>
                ) : (
                    items
                )}
            </div>
        </div>
    );
};

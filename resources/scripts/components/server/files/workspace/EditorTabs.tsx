import React, { useEffect, useRef, useState } from 'react';
import { XIcon } from '@heroicons/react/solid';
import { Tab } from '@/lib/workspace';

interface Props {
    tabs: Tab[];
    active: string | null;
    dirty: ReadonlySet<string>;
    onActivate: (path: string) => void;
    onClose: (path: string) => void;
    onMove: (from: string, to: string) => void;
    // Buttons on the right of the tabs.
    children?: React.ReactNode;
}

/** The tabs above the editor: click to switch, the cross or a middle click to close, drag to reorder. A dot says the file has changes. */
export default ({ tabs, active, dirty, onActivate, onClose, onMove, children }: Props) => {
    const [dragging, setDragging] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const activeRef = useRef<HTMLDivElement>(null);

    // The tab that was just opened or chosen is brought into view when there are more tabs than room.
    useEffect(() => {
        activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [active, tabs.length]);

    return (
        <div className={'flex items-stretch border-b border-neutral-500 bg-neutral-600'}>
            <div role={'tablist'} className={'flex min-w-0 flex-1 overflow-x-auto'}>
                {tabs.map((tab) => {
                    const isActive = tab.path === active;
                    const isDirty = dirty.has(tab.path);

                    return (
                        <div
                            key={tab.path}
                            ref={isActive ? activeRef : undefined}
                            role={'tab'}
                            aria-selected={isActive}
                            title={tab.path}
                            draggable
                            onDragStart={(e) => {
                                setDragging(tab.path);
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', tab.path);
                            }}
                            onDragOver={(e) => {
                                if (dragging && dragging !== tab.path) {
                                    e.preventDefault();
                                    setOver(tab.path);
                                }
                            }}
                            onDragLeave={() => setOver((current) => (current === tab.path ? null : current))}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (dragging) onMove(dragging, tab.path);
                                setDragging(null);
                                setOver(null);
                            }}
                            onDragEnd={() => {
                                setDragging(null);
                                setOver(null);
                            }}
                            onClick={() => onActivate(tab.path)}
                            // A middle click closes, like in a browser.
                            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
                            onAuxClick={(e) => {
                                if (e.button === 1) {
                                    e.preventDefault();
                                    onClose(tab.path);
                                }
                            }}
                            style={{
                                minWidth: '7rem',
                                maxWidth: '14rem',
                                // The accent line on top of the tab that is shown, and where a dragged tab would land.
                                boxShadow:
                                    over === tab.path
                                        ? 'inset 0 0 0 2px rgb(var(--c-primary-400))'
                                        : isActive
                                        ? 'inset 0 2px 0 0 rgb(var(--c-primary-600))'
                                        : undefined,
                            }}
                            className={`group relative flex flex-shrink-0 cursor-pointer select-none items-center border-r border-neutral-500 py-2 pl-3 pr-1.5 text-sm ${
                                isActive ? 'bg-white text-neutral-50' : 'text-neutral-300 hover:bg-neutral-500'
                            }`}
                        >
                            <span className={'truncate'}>{tab.name}</span>
                            <button
                                type={'button'}
                                aria-label={`Close ${tab.name}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClose(tab.path);
                                }}
                                className={
                                    'ml-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded hover:bg-neutral-500/50'
                                }
                            >
                                {isDirty ? (
                                    <>
                                        <span
                                            className={'h-2 w-2 rounded-full bg-neutral-300 group-hover:hidden'}
                                            aria-label={'Unsaved changes'}
                                        />
                                        <XIcon className={'hidden h-3.5 w-3.5 group-hover:block'} />
                                    </>
                                ) : (
                                    <XIcon
                                        className={`h-3.5 w-3.5 ${isActive ? '' : 'opacity-0 group-hover:opacity-100'}`}
                                    />
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>
            {children && (
                <div className={'flex flex-shrink-0 items-center gap-2 border-l border-neutral-500 px-2'}>
                    {children}
                </div>
            )}
        </div>
    );
};

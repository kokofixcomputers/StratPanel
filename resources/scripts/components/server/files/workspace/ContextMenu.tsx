import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MenuItem {
    label: string;
    onSelect: () => void;
    danger?: boolean;
    hidden?: boolean;
    // A line above this item.
    separator?: boolean;
}

/** A menu at the position of a right click, closed by clicking anywhere else, scrolling, Escape or choosing something. */
export default ({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: x, top: y });

    // Kept inside the window, a menu at the bottom edge opens upwards.
    useLayoutEffect(() => {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;

        setPosition({
            left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
            top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)),
        });
    }, [x, y]);

    useEffect(() => {
        const close = () => onClose();
        const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();

        window.addEventListener('mousedown', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        window.addEventListener('keydown', key);

        return () => {
            window.removeEventListener('mousedown', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('keydown', key);
        };
    }, [onClose]);

    const visible = items.filter((item) => !item.hidden);
    if (!visible.length) return null;

    return (
        <div
            ref={ref}
            role={'menu'}
            // A click inside must not reach the window listener that closes the menu before the item has been chosen.
            onMouseDown={(e) => e.stopPropagation()}
            style={{ position: 'fixed', left: position.left, top: position.top, zIndex: 60, minWidth: '11rem' }}
            className={'rounded-lg border border-neutral-500 bg-white py-1 text-sm shadow-lg'}
        >
            {visible.map((item) => (
                <React.Fragment key={item.label}>
                    {item.separator && <div className={'my-1 h-px bg-neutral-500'} />}
                    <button
                        type={'button'}
                        role={'menuitem'}
                        onClick={() => {
                            onClose();
                            item.onSelect();
                        }}
                        className={`block w-full px-3 py-1.5 text-left ${
                            item.danger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-200 hover:bg-neutral-600'
                        }`}
                    >
                        {item.label}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
};

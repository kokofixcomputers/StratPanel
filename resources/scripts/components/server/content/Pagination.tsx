import React from 'react';
import classNames from 'classnames';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid';
import { pageWindow } from '@/components/server/content/pageWindow';

const Cell = ({
    children,
    onClick,
    active,
    disabled,
    label,
}: {
    children: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    label: string;
}) => (
    <button
        type={'button'}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        disabled={disabled}
        onClick={onClick}
        className={classNames(
            'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors duration-150',
            active
                ? 'border-primary-600 bg-primary-600 text-white'
                : 'border-neutral-500 bg-white text-neutral-300 hover:bg-neutral-600 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white'
        )}
    >
        {children}
    </button>
);

/** Numbered pages with previous and next, in place of a button that loads more. */
export default ({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) => {
    if (pages <= 1) return null;

    return (
        <nav aria-label={'Pages'} className={'flex flex-wrap items-center justify-center gap-1.5'}>
            <Cell label={'Previous page'} disabled={page <= 1} onClick={() => onChange(page - 1)}>
                <ChevronLeftIcon className={'h-5 w-5'} />
            </Cell>
            {pageWindow(page, pages).map((n, index) =>
                n === null ? (
                    <span key={`gap-${index}`} className={'px-1 text-neutral-400'}>
                        &hellip;
                    </span>
                ) : (
                    <Cell key={n} label={`Page ${n}`} active={n === page} onClick={() => onChange(n)}>
                        {n}
                    </Cell>
                )
            )}
            <Cell label={'Next page'} disabled={page >= pages} onClick={() => onChange(page + 1)}>
                <ChevronRightIcon className={'h-5 w-5'} />
            </Cell>
        </nav>
    );
};

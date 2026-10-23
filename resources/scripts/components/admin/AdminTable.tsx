import React from 'react';
import classNames from 'classnames';

/** The table of a list in the admin area, in the colours of the cards. Columns are the heads, rows are made by the page. */
export const AdminTable = ({
    heads,
    children,
    className,
}: {
    heads: (string | null)[];
    children: React.ReactNode;
    className?: string;
}) => (
    <div className={classNames('overflow-x-auto', className)}>
        <table className={'w-full text-sm'}>
            <thead>
                <tr className={'text-left text-2xs uppercase tracking-wide text-neutral-400'}>
                    {heads.map((head, index) => (
                        <th key={index} className={'whitespace-nowrap px-4 py-3 font-medium'}>
                            {head}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    </div>
);

export const Row = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <tr
        onClick={onClick}
        className={classNames('border-t border-neutral-500', onClick && 'cursor-pointer hover:bg-neutral-600')}
    >
        {children}
    </tr>
);

export const Cell = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <td className={classNames('px-4 py-3 align-middle text-neutral-100', className)}>{children}</td>
);

/** A bar for how full something is; the colour is the level the server worked out. */
export const Meter = ({ percent, level }: { percent: number; level: 'ok' | 'warning' | 'danger' }) => (
    <div className={'h-1.5 overflow-hidden rounded-full bg-neutral-500'}>
        <div
            className={classNames('h-full rounded-full', {
                'bg-primary-600': level === 'ok',
                'bg-yellow-400': level === 'warning',
                'bg-red-500': level === 'danger',
            })}
            style={{ width: `${Math.min(100, percent)}%` }}
        />
    </div>
);

export const Pill = ({
    children,
    tone = 'neutral',
}: {
    children: React.ReactNode;
    tone?: 'neutral' | 'primary' | 'yellow' | 'red' | 'green';
}) => (
    <span
        className={classNames('rounded-full px-2 py-0.5 text-2xs font-medium', {
            'bg-neutral-600 text-neutral-300': tone === 'neutral',
            'bg-primary-50 text-primary-700': tone === 'primary',
            'bg-yellow-50 text-yellow-700': tone === 'yellow',
            'bg-red-50 text-red-700': tone === 'red',
            'bg-green-50 text-green-700': tone === 'green',
        })}
    >
        {children}
    </span>
);

export const Empty = ({ children }: { children: React.ReactNode }) => (
    <p className={'px-5 py-8 text-center text-sm text-neutral-400'}>{children}</p>
);

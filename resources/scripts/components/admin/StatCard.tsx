import React from 'react';
import classNames from 'classnames';

/** A number or a word with what it is, an icon at the corner and a line under it. */
export default ({
    title,
    value,
    sub,
    icon: Icon,
    tone,
}: {
    title: string;
    value: string;
    sub?: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: 'green' | 'red';
}) => (
    <div className={'rounded-xl border border-neutral-500 bg-white p-4 shadow-md'}>
        <div className={'flex items-center justify-between'}>
            <p className={'text-xs uppercase tracking-wide text-neutral-400'}>{title}</p>
            <Icon
                className={classNames('h-5 w-5', {
                    'text-primary-600': !tone,
                    'text-green-600': tone === 'green',
                    'text-red-600': tone === 'red',
                })}
            />
        </div>
        <p
            className={classNames('mt-1 break-all text-xl font-semibold', {
                'text-green-600': tone === 'green',
                'text-red-600': tone === 'red',
                'text-neutral-50': !tone,
            })}
        >
            {value}
        </p>
        {sub && <p className={'mt-0.5 text-xs text-neutral-400'}>{sub}</p>}
    </div>
);

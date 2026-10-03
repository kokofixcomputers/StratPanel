import React from 'react';
import classNames from 'classnames';

interface CodeProps {
    dark?: boolean | undefined;
    className?: string;
    children: React.ReactChild | React.ReactFragment | React.ReactPortal;
}

export default ({ dark, className, children }: CodeProps) => (
    <code
        className={classNames('font-mono text-sm px-2 py-1 inline-block rounded', className, {
            'bg-neutral-600 text-neutral-100': !dark,
            'bg-neutral-600 text-neutral-50': dark,
        })}
    >
        {children}
    </code>
);

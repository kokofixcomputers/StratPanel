import React from 'react';

/** One line of facts: an icon and what it is on the left, the value on the right. */
export default ({
    label,
    icon: Icon,
    children,
}: {
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
}) => (
    <div className={'flex items-start justify-between gap-4 py-2.5 text-sm'}>
        <dt className={'flex flex-shrink-0 items-center gap-2 text-neutral-400'}>
            {Icon && <Icon className={'h-4 w-4 text-neutral-400'} />}
            {label}
        </dt>
        <dd className={'min-w-0 break-words text-right text-neutral-100'}>{children}</dd>
    </div>
);

import React from 'react';
import classNames from 'classnames';

export const PageHeader = ({
    title,
    subtitle,
    className,
}: {
    title: string;
    subtitle?: string;
    className?: string;
}) => (
    <div className={classNames('mb-6', className)}>
        <h1 className={'text-3xl font-bold tracking-tight text-neutral-50'}>{title}</h1>
        {subtitle && <p className={'mt-1 text-neutral-400'}>{subtitle}</p>}
    </div>
);

interface ListHeaderProps {
    icon: React.ReactNode;
    title: string;
    count?: string;
    children?: React.ReactNode;
    className?: string;
}

/**
 * The card that sits on top of a list of items and holds its title, a count pill and the primary action.
 */
export const ListHeader = ({ icon, title, count, children, className }: ListHeaderProps) => (
    <div
        className={classNames(
            'flex flex-wrap items-center justify-between gap-3 bg-white border border-neutral-500 rounded-xl shadow-md px-5 py-4 mb-4',
            className
        )}
    >
        <div className={'flex items-center min-w-0'}>
            <span className={'flex-shrink-0 text-primary-600 mr-3'}>{icon}</span>
            <h2 className={'text-lg font-semibold text-neutral-50'}>{title}</h2>
            {count && (
                <span className={'ml-3 rounded-full bg-neutral-600 px-2.5 py-0.5 text-xs font-medium text-neutral-300'}>
                    {count}
                </span>
            )}
        </div>
        {children && <div className={'flex items-center gap-3'}>{children}</div>}
    </div>
);

export const EmptyState = ({ children }: { children: React.ReactNode }) => (
    <div
        className={
            'bg-white border border-dashed border-neutral-400/50 rounded-xl py-12 px-6 text-center text-sm text-neutral-400'
        }
    >
        {children}
    </div>
);

export default PageHeader;

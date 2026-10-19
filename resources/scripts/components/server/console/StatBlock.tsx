import React from 'react';
import classNames from 'classnames';
import styles from './style.module.css';
import CopyOnClick from '@/components/elements/CopyOnClick';
import Tooltip from '@/components/elements/tooltip/Tooltip';

interface StatBlockProps {
    title: string;
    // Something small next to the title, such as an icon.
    adornment?: React.ReactNode;
    subtitle?: React.ReactNode;
    copyOnClick?: string;
    alarm?: 'warning' | 'danger';
    visual?: React.ReactNode;
    mono?: boolean;
    // What hovering the value shows: the exact numbers behind the rounded one.
    exact?: React.ReactChild;
    children: React.ReactNode;
    className?: string;
}

export default ({
    title,
    adornment,
    subtitle,
    copyOnClick,
    alarm,
    visual,
    mono,
    exact,
    className,
    children,
}: StatBlockProps) => {
    const value = (
        <div
            className={classNames('mt-2 font-semibold truncate', {
                'text-2xl xl:text-3xl text-neutral-50': !mono,
                'text-xl font-mono text-neutral-50': mono,
                '!text-yellow-600': alarm === 'warning',
                '!text-red-600': alarm === 'danger',
                'cursor-help': !!exact,
            })}
        >
            {children}
        </div>
    );

    return (
        <CopyOnClick text={copyOnClick}>
            <div className={classNames(styles.stat_block, className)}>
                <div className={'min-w-0 flex-1 pr-4'}>
                    <p className={'flex items-center gap-1.5 text-sm text-neutral-300'}>
                        {title}
                        {adornment}
                    </p>
                    {exact ? (
                        <Tooltip arrow placement={'bottom-start'} content={exact}>
                            {value}
                        </Tooltip>
                    ) : (
                        value
                    )}
                    {subtitle && <p className={'mt-2 text-sm text-neutral-400 truncate'}>{subtitle}</p>}
                </div>
                {visual && <div className={'flex-shrink-0'}>{visual}</div>}
            </div>
        </CopyOnClick>
    );
};

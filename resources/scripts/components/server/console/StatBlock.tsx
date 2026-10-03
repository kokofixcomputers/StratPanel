import React from 'react';
import classNames from 'classnames';
import styles from './style.module.css';
import CopyOnClick from '@/components/elements/CopyOnClick';

interface StatBlockProps {
    title: string;
    subtitle?: React.ReactNode;
    copyOnClick?: string;
    alarm?: 'warning' | 'danger';
    visual?: React.ReactNode;
    mono?: boolean;
    children: React.ReactNode;
    className?: string;
}

export default ({ title, subtitle, copyOnClick, alarm, visual, mono, className, children }: StatBlockProps) => (
    <CopyOnClick text={copyOnClick}>
        <div className={classNames(styles.stat_block, className)}>
            <div className={'min-w-0 flex-1 pr-4'}>
                <p className={'text-sm text-neutral-300'}>{title}</p>
                <div
                    className={classNames('mt-2 font-semibold truncate', {
                        'text-2xl xl:text-3xl text-neutral-50': !mono,
                        'text-xl font-mono text-neutral-50': mono,
                        '!text-yellow-600': alarm === 'warning',
                        '!text-red-600': alarm === 'danger',
                    })}
                >
                    {children}
                </div>
                {subtitle && <p className={'mt-2 text-sm text-neutral-400 truncate'}>{subtitle}</p>}
            </div>
            {visual && <div className={'flex-shrink-0'}>{visual}</div>}
        </div>
    </CopyOnClick>
);

import { ExclamationIcon, ShieldExclamationIcon } from '@heroicons/react/outline';
import React from 'react';
import classNames from 'classnames';

interface AlertProps {
    type: 'warning' | 'danger';
    className?: string;
    children: React.ReactNode;
}

export default ({ type, className, children }: AlertProps) => {
    return (
        <div
            className={classNames(
                'flex items-center border rounded-xl px-4 py-3 text-sm',
                {
                    ['border-red-200 bg-red-50 text-red-800']: type === 'danger',
                    ['border-yellow-200 bg-yellow-50 text-yellow-800']: type === 'warning',
                },
                className
            )}
        >
            {type === 'danger' ? (
                <ShieldExclamationIcon className={'w-5 h-5 text-red-500 mr-3 flex-shrink-0'} />
            ) : (
                <ExclamationIcon className={'w-5 h-5 text-yellow-500 mr-3 flex-shrink-0'} />
            )}
            {children}
        </div>
    );
};

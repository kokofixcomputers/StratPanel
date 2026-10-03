import React, { useContext } from 'react';
import { DialogContext } from './';
import { useDeepCompareEffect } from '@/plugins/useDeepCompareEffect';

export default ({ children }: { children: React.ReactNode }) => {
    const { setFooter } = useContext(DialogContext);

    useDeepCompareEffect(() => {
        setFooter(
            <div
                className={
                    'px-6 py-4 bg-neutral-900 border-t border-neutral-500 flex items-center justify-end space-x-3 rounded-b-2xl'
                }
            >
                {children}
            </div>
        );
    }, [children]);

    return null;
};

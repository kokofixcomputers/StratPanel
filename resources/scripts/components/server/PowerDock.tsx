import React, { useEffect } from 'react';
import Can from '@/components/elements/Can';
import PowerButtons from '@/components/server/console/PowerButtons';
import { useThemeConfig } from '@/lib/themeConfig';

/**
 * The power buttons floating at the bottom of every server page, if the theme asks for it (`powerDock` in lib/themeConfig.ts): as a dock of
 * icons, or a dock with the names of the actions next to them.
 */
export default () => {
    const mode = useThemeConfig().powerDock;

    // Room at the bottom of the page, so the dock does not cover the last thing on it.
    useEffect(() => {
        document.body.classList.toggle('has-power-dock', mode !== 'off');

        return () => document.body.classList.remove('has-power-dock');
    }, [mode]);

    if (mode === 'off') return null;

    return (
        <Can action={['control.start', 'control.stop', 'control.restart']} matchAny>
            <div
                className={
                    'glass fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-2xl border border-neutral-500 bg-white p-1.5 shadow-lg'
                }
                role={'toolbar'}
                aria-label={'Power actions'}
            >
                <PowerButtons compact={mode === 'icons'} className={'flex items-center gap-1.5'} />
            </div>
        </Can>
    );
};

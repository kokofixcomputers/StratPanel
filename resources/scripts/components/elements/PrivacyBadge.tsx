import React from 'react';
import { EyeOffIcon } from '@heroicons/react/outline';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import { usePrivacy } from '@/lib/privacy';

/** In the bar at the top, only while sensitive information is hidden: a reminder, and a click shows everything again. */
export default () => {
    const [hidden, setHidden] = usePrivacy();
    if (!hidden) return null;

    return (
        <Tooltip placement={'bottom'} content={'Sensitive information is hidden. Click to show it.'}>
            <button
                type={'button'}
                aria-label={'Sensitive information is hidden. Show it.'}
                className={'active'}
                onClick={() => setHidden(false)}
            >
                <EyeOffIcon />
            </button>
        </Tooltip>
    );
};

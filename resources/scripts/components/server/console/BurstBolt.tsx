import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { LightningBoltIcon } from '@heroicons/react/solid';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import { BurstState, describeBurst } from '@/lib/cpuBurst';

/**
 * The bolt next to the CPU usage: grey while the server could burst above its CPU limit, green while it is doing so. Hovering
 * says for how long. It is not there at all when the node does not let servers burst.
 */
export default ({ state, limit, percent }: { state: BurstState; limit: number; percent: number }) => {
    const active = state.activeSince !== null;
    // The time in the tooltip counts up while it is open.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        setNow(Date.now());
        if (!active) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(timer);
    }, [active, state.lastActiveAt]);

    const lines = describeBurst(state, now, limit, percent);

    return (
        <Tooltip
            arrow
            placement={'top'}
            content={
                <div className={'space-y-0.5'}>
                    {lines.map((line, i) => (
                        <div key={line} className={i === 0 ? '' : 'font-normal text-slate-300'}>
                            {line}
                        </div>
                    ))}
                </div>
            }
        >
            <span
                role={'img'}
                tabIndex={0}
                aria-label={lines.join('. ')}
                data-burst={active ? 'active' : 'ready'}
                className={classNames(
                    'inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full transition-colors duration-300',
                    active ? 'bg-green-100 text-green-600' : 'text-neutral-400'
                )}
            >
                <LightningBoltIcon className={classNames('h-3.5 w-3.5', active && 'motion-safe:animate-pulse')} />
            </span>
        </Tooltip>
    );
};

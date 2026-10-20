import React from 'react';
import { censor, usePrivacy } from '@/lib/privacy';

/** Blurred until the pointer (or keyboard focus, or a tap) is on it. */
export const BLUR_CLASS = 'select-none blur-sm hover:blur-none focus:blur-none transition duration-150 cursor-default';

/**
 * Shows what is inside, blurred while "Hide sensitive information" is on: an address, an email. It clears up while the pointer is over it.
 */
export default ({ children }: { children: string | number | null | undefined }) => {
    const [hidden] = usePrivacy();
    if (children === null || children === undefined) return null;
    if (!hidden) return <>{children}</>;

    return (
        <span className={`inline-block ${BLUR_CLASS}`} tabIndex={0}>
            {children}
        </span>
    );
};

/** The same for a place that needs a string and cannot blur (a tooltip, the terminal): dots instead. */
export const useCensor = (): ((value: string) => string) => {
    const [hidden] = usePrivacy();

    return (value: string) => (hidden ? censor(value) : value);
};

/** A class for an input that holds something sensitive: blurred while hidden, clear on hover or focus. */
export const useHiddenClass = (): string => {
    const [hidden] = usePrivacy();

    return hidden ? BLUR_CLASS : '';
};

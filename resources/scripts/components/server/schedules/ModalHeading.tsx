import React from 'react';

/** The top of the schedule windows: an icon, what this is and a line about it. Leaves room for the close button. */
export default ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) => (
    <div className={'mb-6 flex items-center gap-4 pr-10'}>
        <span
            className={
                'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600'
            }
        >
            {icon}
        </span>
        <div className={'min-w-0'}>
            <h3 className={'truncate text-xl font-semibold text-neutral-50'}>{title}</h3>
            <p className={'text-sm text-neutral-400'}>{subtitle}</p>
        </div>
    </div>
);

/** A little label over a group of fields. */
export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className={'mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>{children}</p>
);

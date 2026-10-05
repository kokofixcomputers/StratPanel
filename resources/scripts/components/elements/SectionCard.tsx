import React from 'react';
import classNames from 'classnames';
import FlashMessageRender from '@/components/FlashMessageRender';

interface Props {
    icon: React.ReactNode;
    title: string;
    description?: string;
    // Shows the flash messages of this key at the top of the card.
    flash?: string;
    // Something to show on the right of the title, such as a status label.
    badge?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

/** A card with an icon, a title and a short description above its content, used for settings screens. */
export default ({ icon, title, description, flash, badge, className, children }: Props) => (
    <section className={classNames('rounded-xl border border-neutral-500 bg-white shadow-md', className)}>
        <div className={'flex items-start gap-3 border-b border-neutral-500 px-5 py-4'}>
            <span
                className={
                    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600'
                }
            >
                {icon}
            </span>
            <div className={'min-w-0 flex-1'}>
                <h2 className={'text-base font-semibold text-neutral-50'}>{title}</h2>
                {description && <p className={'mt-0.5 text-sm text-neutral-400'}>{description}</p>}
            </div>
            {badge}
        </div>
        <div className={'p-5'}>
            {flash && <FlashMessageRender byKey={flash} className={'mb-4'} />}
            {children}
        </div>
    </section>
);

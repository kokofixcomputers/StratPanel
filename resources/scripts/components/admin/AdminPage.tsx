import React from 'react';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader from '@/components/elements/PageHeader';

interface Props {
    title: string;
    subtitle?: string;
    // Buttons on the right of the title.
    actions?: React.ReactNode;
    children: React.ReactNode;
}

/** The frame of a page of the admin area: the title, what can be done on the page and the flash messages (key "admin"). */
export default ({ title, subtitle, actions, children }: Props) => (
    <PageContentBlock title={`${title} - Admin`} showFlashKey={'admin'}>
        <div className={'mb-6 flex flex-wrap items-start justify-between gap-3'}>
            <PageHeader title={title} subtitle={subtitle} className={'mb-0'} />
            {actions && <div className={'flex items-center gap-3'}>{actions}</div>}
        </div>
        {children}
    </PageContentBlock>
);

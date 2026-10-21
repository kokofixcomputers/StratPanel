import React, { useState } from 'react';
import classNames from 'classnames';
import {
    CheckCircleIcon,
    ExclamationIcon,
    InformationCircleIcon,
    ShieldExclamationIcon,
    XIcon,
} from '@heroicons/react/solid';
import useBranding from '@/plugins/useBranding';
import { AnnouncementType, appliesTo, isSafeUrl, Place, visibleAnnouncements } from '@/lib/branding';
import useHoldings from '@/components/dashboard/useHoldings';

const STORAGE = 'stratosphere:dismissed_announcements';

const readDismissed = (): string[] => {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE) || '[]');

        return Array.isArray(value) ? value.map(String) : [];
    } catch (e) {
        return [];
    }
};

const STYLES: Record<
    AnnouncementType,
    { box: string; icon: string; Icon: React.ComponentType<{ className?: string }> }
> = {
    info: { box: 'border-blue-200 bg-blue-50 text-blue-900', icon: 'text-blue-500', Icon: InformationCircleIcon },
    success: { box: 'border-green-200 bg-green-50 text-green-900', icon: 'text-green-500', Icon: CheckCircleIcon },
    warning: { box: 'border-yellow-200 bg-yellow-50 text-yellow-900', icon: 'text-yellow-500', Icon: ExclamationIcon },
    danger: { box: 'border-red-200 bg-red-50 text-red-900', icon: 'text-red-500', Icon: ShieldExclamationIcon },
};

/** The announcements of the admin, above the servers. A dismissed one stays away until it is edited. */
export default ({ className, place = 'dashboard' }: { className?: string; place?: Place }) => {
    const { announcements } = useBranding();
    const needsServers = announcements.some((a) => a.eggs.length + a.software.length + a.nodes.length > 0);
    const holdings = useHoldings(needsServers);
    const [dismissed, setDismissed] = useState<string[]>(readDismissed);

    const dismiss = (key: string) => {
        const next = [...dismissed, key].slice(-100);
        setDismissed(next);
        try {
            localStorage.setItem(STORAGE, JSON.stringify(next));
        } catch (e) {
            // The announcement is gone for this visit, which is all that can be done.
        }
    };

    // Only the ones for this part of the panel and for what this person has, and not the ones they dismissed.
    const shown = visibleAnnouncements(
        announcements.filter((a) => appliesTo(a, place, holdings)),
        dismissed
    );
    if (!shown.length) return null;

    return (
        <div className={classNames('space-y-3', className)} aria-label={'Announcements'}>
            {shown.map((a) => {
                const { box, icon, Icon } = STYLES[a.type];

                return (
                    <div
                        key={a.key}
                        role={'status'}
                        className={classNames('flex items-start rounded-xl border px-4 py-3 text-sm', box)}
                    >
                        <Icon className={classNames('mr-3 mt-0.5 h-5 w-5 flex-shrink-0', icon)} />
                        <div className={'min-w-0 flex-1'}>
                            {a.title && <p className={'font-semibold'}>{a.title}</p>}
                            <p className={'whitespace-pre-line break-words'}>{a.message}</p>
                            {a.linkUrl && a.linkLabel && isSafeUrl(a.linkUrl) && (
                                <a
                                    href={a.linkUrl}
                                    target={/^https?:/i.test(a.linkUrl) ? '_blank' : undefined}
                                    rel={'noopener noreferrer'}
                                    className={'mt-1 inline-block font-medium underline'}
                                >
                                    {a.linkLabel}
                                </a>
                            )}
                        </div>
                        {a.dismissible && (
                            <button
                                type={'button'}
                                onClick={() => dismiss(a.key)}
                                aria-label={'Dismiss announcement'}
                                className={'ml-3 flex-shrink-0 opacity-60 hover:opacity-100'}
                            >
                                <XIcon className={'h-4 w-4'} />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

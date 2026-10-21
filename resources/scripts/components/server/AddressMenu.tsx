import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import copy from 'copy-to-clipboard';
import { CheckIcon, ChevronDownIcon, ClipboardCopyIcon, GlobeAltIcon, ServerIcon } from '@heroicons/react/solid';
import DropdownMenu from '@/components/elements/DropdownMenu';
import Sensitive from '@/components/elements/Sensitive';
import { ConnectionAddress } from '@/lib/connection';

const Row = ({ entry }: { entry: ConnectionAddress }) => {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return undefined;
        const timer = setTimeout(() => setCopied(false), 1500);

        return () => clearTimeout(timer);
    }, [copied]);

    const Icon = entry.kind === 'domain' ? GlobeAltIcon : ServerIcon;

    return (
        <button
            type={'button'}
            title={'Copy'}
            // The menu stays open so more than one can be copied, it closes when the pointer goes to the page.
            onClick={(e) => {
                e.stopPropagation();
                copy(entry.address);
                setCopied(true);
            }}
            className={
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-600 hover:text-neutral-50'
            }
        >
            <Icon
                className={classNames(
                    'h-4 w-4 flex-shrink-0',
                    entry.kind === 'domain' ? 'text-primary-600' : 'text-neutral-400'
                )}
            />
            <span className={'min-w-0 flex-1 truncate font-mono text-xs'}>
                <Sensitive>{entry.address}</Sensitive>
            </span>
            {entry.primary && (
                <span className={'rounded-full bg-neutral-600 px-1.5 text-2xs text-neutral-300'}>default</span>
            )}
            {copied ? (
                <span className={'flex items-center gap-1 text-2xs font-medium text-green-600'}>
                    <CheckIcon className={'h-3.5 w-3.5'} />
                    Copied
                </span>
            ) : (
                <ClipboardCopyIcon className={'h-4 w-4 flex-shrink-0 text-neutral-400'} />
            )}
        </button>
    );
};

/**
 * A small down arrow that opens a list of every address a server can be reached at, domains first, then the IP addresses. A click on one
 * copies it. Nothing is drawn when there is only one address, there is nothing to choose from.
 */
export default ({ addresses, className }: { addresses: ConnectionAddress[]; className?: string }) => {
    if (addresses.length < 2) return null;

    const domains = addresses.filter((a) => a.kind === 'domain');
    const ips = addresses.filter((a) => a.kind === 'ip');

    return (
        <DropdownMenu
            width={'24rem'}
            renderToggle={(onClick) => (
                <button
                    type={'button'}
                    title={'All connection addresses'}
                    aria-label={'All connection addresses'}
                    onClick={(e) => {
                        // The block around it copies the address on a click, this is not that.
                        e.stopPropagation();
                        onClick(e);
                    }}
                    className={classNames(
                        'fx flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-600 hover:text-neutral-50',
                        className
                    )}
                >
                    <ChevronDownIcon className={'h-4 w-4'} />
                </button>
            )}
        >
            <div className={'w-full'}>
                {domains.length > 0 && (
                    <>
                        <p
                            className={
                                'px-3 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-neutral-400'
                            }
                        >
                            Domains
                        </p>
                        {domains.map((entry) => (
                            <Row key={entry.address} entry={entry} />
                        ))}
                    </>
                )}
                {ips.length > 0 && (
                    <>
                        <p className={'px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-neutral-400'}>
                            IP addresses
                        </p>
                        {ips.map((entry) => (
                            <Row key={entry.address} entry={entry} />
                        ))}
                    </>
                )}
            </div>
        </DropdownMenu>
    );
};

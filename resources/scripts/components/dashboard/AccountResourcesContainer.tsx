import React from 'react';
import { Link } from 'react-router-dom';
import tw from 'twin.macro';
import { ChartBarIcon, PlusCircleIcon, ServerIcon } from '@heroicons/react/solid';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader from '@/components/elements/PageHeader';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import FlashMessageRender from '@/components/FlashMessageRender';
import useAccountResources from '@/api/account/resources';
import { PoolAmounts } from '@/api/selfService';
import { bytesToString, mbToBytes } from '@/lib/formatters';

const ROWS: { key: keyof PoolAmounts; label: string; format: (value: number) => string }[] = [
    { key: 'memory', label: 'Memory', format: (v) => bytesToString(mbToBytes(v)) },
    { key: 'disk', label: 'Disk space', format: (v) => bytesToString(mbToBytes(v)) },
    { key: 'cpu', label: 'CPU', format: (v) => `${v}% (${(v / 100).toFixed(1)} cores)` },
    { key: 'allocations', label: 'Allocations', format: (v) => String(v) },
    { key: 'backups', label: 'Backups', format: (v) => String(v) },
];

/** Account > Resources: what you may spend on servers, what is used and what is left. */
export default () => {
    const { data, error } = useAccountResources();

    return (
        <PageContentBlock title={'Resources'}>
            <div css={tw`mt-6`}>
                <PageHeader title={'Resources'} subtitle={'What your account has for servers, and what they use'} />
            </div>
            <FlashMessageRender byKey={'account'} css={tw`mb-4`} />
            {!data ? (
                error ? (
                    <p css={tw`text-sm text-red-600`}>The resources of your account could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )
            ) : (
                <div css={tw`grid gap-4 mb-10`}>
                    <SectionCard
                        icon={<ChartBarIcon className={'h-5 w-5'} />}
                        title={'Your pool'}
                        description={
                            data.limited
                                ? 'The most your servers can add up to. Deleting a server gives its share back.'
                                : data.enabled
                                ? 'Your account is not limited by a pool, what your servers use is shown.'
                                : 'This panel does not use resource pools, what your servers use is shown.'
                        }
                    >
                        <ul css={tw`space-y-4`}>
                            {ROWS.map((row) => {
                                const used = data.used[row.key];
                                const limit = data.limits?.[row.key] ?? null;
                                const percent = limit ? Math.min(100, (used / limit) * 100) : 0;

                                return (
                                    <li key={row.key}>
                                        <div css={tw`flex items-baseline justify-between text-sm`}>
                                            <span css={tw`font-medium text-neutral-200`}>{row.label}</span>
                                            <span css={tw`text-neutral-50`}>
                                                <strong>{row.format(used)}</strong>
                                                {limit !== null && (
                                                    <span css={tw`text-neutral-400`}> of {row.format(limit)}</span>
                                                )}
                                            </span>
                                        </div>
                                        {limit !== null && (
                                            <>
                                                <div css={tw`mt-1.5 h-2 rounded-full bg-neutral-500 overflow-hidden`}>
                                                    <div
                                                        css={tw`h-full rounded-full bg-primary-600`}
                                                        style={{ width: `${percent}%` }}
                                                    />
                                                </div>
                                                <p css={tw`mt-1 text-xs text-neutral-400`}>
                                                    {row.format(data.remaining?.[row.key] ?? 0)} left
                                                </p>
                                            </>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        {data.limited && (
                            <div css={tw`mt-6 text-right`}>
                                <Link to={'/create'} css={tw`inline-flex items-center text-sm font-medium`}>
                                    <PlusCircleIcon css={tw`w-4 h-4 mr-1.5`} />
                                    Create a server
                                </Link>
                            </div>
                        )}
                    </SectionCard>
                    <SectionCard
                        icon={<ServerIcon className={'h-5 w-5'} />}
                        title={'Your servers'}
                        description={`${data.servers.length} ${data.servers.length === 1 ? 'server' : 'servers'}`}
                        className={'overflow-hidden'}
                    >
                        {data.servers.length === 0 ? (
                            <p css={tw`text-sm text-neutral-300`}>You do not own a server yet.</p>
                        ) : (
                            <div css={tw`overflow-x-auto -mx-1`}>
                                <table css={tw`w-full text-sm`}>
                                    <thead>
                                        <tr css={tw`text-left text-2xs uppercase tracking-wide text-neutral-400`}>
                                            <th css={tw`px-1 pb-2 font-medium`}>Server</th>
                                            {ROWS.map((row) => (
                                                <th key={row.key} css={tw`px-1 pb-2 font-medium text-right`}>
                                                    {row.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.servers.map((server) => (
                                            <tr key={server.identifier} css={tw`border-t border-neutral-500`}>
                                                <td css={tw`px-1 py-2`}>
                                                    <Link to={`/server/${server.identifier}`}>{server.name}</Link>
                                                </td>
                                                {ROWS.map((row) => (
                                                    <td key={row.key} css={tw`px-1 py-2 text-right text-neutral-100`}>
                                                        {row.key === 'memory' && server.memory === 0
                                                            ? 'Unlimited'
                                                            : row.format(server[row.key])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>
                </div>
            )}
        </PageContentBlock>
    );
};

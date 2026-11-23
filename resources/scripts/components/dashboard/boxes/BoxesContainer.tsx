import React from 'react';
import { Link } from 'react-router-dom';
import { CubeIcon } from '@heroicons/react/outline';
import PageContentBlock from '@/components/elements/PageContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import Spinner from '@/components/elements/Spinner';
import { useBoxes } from '@/api/boxes';
import { useStore } from '@/api/store';
import BoxMeters from '@/components/dashboard/boxes/BoxMeters';
import BoxStatus from '@/components/dashboard/boxes/BoxStatus';

/** The boxes a person owns: resources they got (from an admin, or from the store) that their servers share. */
export default () => {
    const { data: boxes, error } = useBoxes();
    const store = useStore().data;

    return (
        <PageContentBlock title={'Boxes'}>
            <div className={'mt-6'}>
                <PageHeader
                    title={'Boxes'}
                    subtitle={'Memory, CPU, disk and more that you share between the servers you make inside a box'}
                />
            </div>
            {!boxes ? (
                error ? (
                    <p className={'text-sm text-red-600'}>Your boxes could not be loaded.</p>
                ) : (
                    <Spinner size={'large'} centered />
                )
            ) : boxes.length === 0 ? (
                <EmptyState>
                    You have no boxes.{' '}
                    {store?.open && (
                        <>
                            <Link to={'/store'} className={'font-semibold text-primary-600 hover:underline'}>
                                Look in the store
                            </Link>{' '}
                            for one.
                        </>
                    )}
                </EmptyState>
            ) : (
                <div className={'grid gap-4 lg:grid-cols-2'}>
                    {boxes.map((box) => (
                        <Link
                            key={box.id}
                            to={`/boxes/${box.id}`}
                            className={
                                'block rounded-xl border border-neutral-500 bg-white p-5 shadow-md transition-colors hover:bg-neutral-600'
                            }
                        >
                            <div className={'mb-4 flex items-start gap-3'}>
                                <span
                                    className={
                                        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600'
                                    }
                                >
                                    <CubeIcon className={'h-5 w-5'} />
                                </span>
                                <div className={'min-w-0 flex-1'}>
                                    <p className={'truncate text-base font-semibold text-neutral-50'}>{box.name}</p>
                                    <p className={'text-xs text-neutral-400'}>
                                        {box.servers} {box.servers === 1 ? 'server' : 'servers'}
                                        {box.node ? ` · ${box.node.name}` : ''}
                                    </p>
                                </div>
                                <BoxStatus box={box} />
                            </div>
                            <BoxMeters limits={box.limits} used={box.used} compact />
                        </Link>
                    ))}
                </div>
            )}
        </PageContentBlock>
    );
};

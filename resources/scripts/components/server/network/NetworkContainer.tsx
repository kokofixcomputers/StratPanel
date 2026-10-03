import React, { useEffect, useState } from 'react';
import Spinner from '@/components/elements/Spinner';
import { useFlashKey } from '@/plugins/useFlash';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { ServerContext } from '@/state/server';
import AllocationRow from '@/components/server/network/AllocationRow';
import { Button } from '@/components/elements/button/index';
import createServerAllocation from '@/api/server/network/createServerAllocation';
import tw from 'twin.macro';
import { ShareIcon } from '@heroicons/react/outline';
import { PlusIcon } from '@heroicons/react/solid';
import PageHeader, { ListHeader } from '@/components/elements/PageHeader';
import Can from '@/components/elements/Can';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import getServerAllocations from '@/api/swr/getServerAllocations';
import isEqual from 'react-fast-compare';
import { useDeepCompareEffect } from '@/plugins/useDeepCompareEffect';

const NetworkContainer = () => {
    const [loading, setLoading] = useState(false);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const allocationLimit = ServerContext.useStoreState((state) => state.server.data!.featureLimits.allocations);
    const allocations = ServerContext.useStoreState((state) => state.server.data!.allocations, isEqual);
    const setServerFromState = ServerContext.useStoreActions((actions) => actions.server.setServerFromState);

    const { clearFlashes, clearAndAddHttpError } = useFlashKey('server:network');
    const { data, error, mutate } = getServerAllocations();

    useEffect(() => {
        mutate(allocations);
    }, []);

    useEffect(() => {
        clearAndAddHttpError(error);
    }, [error]);

    useDeepCompareEffect(() => {
        if (!data) return;

        setServerFromState((state) => ({ ...state, allocations: data }));
    }, [data]);

    const onCreateAllocation = () => {
        clearFlashes();

        setLoading(true);
        createServerAllocation(uuid)
            .then((allocation) => {
                setServerFromState((s) => ({ ...s, allocations: s.allocations.concat(allocation) }));
                return mutate(data?.concat(allocation), false);
            })
            .catch((error) => clearAndAddHttpError(error))
            .then(() => setLoading(false));
    };

    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);

    return (
        <ServerContentBlock showFlashKey={'server:network'} title={'Network'}>
            <PageHeader title={'Network'} subtitle={`Manage network allocations for ${serverName}`} />
            <ListHeader
                icon={<ShareIcon className={'w-6 h-6'} />}
                title={'Network'}
                count={data ? `${data.length} / ${allocationLimit}` : undefined}
            >
                {allocationLimit > 0 && data && allocationLimit > data.length && (
                    <Can action={'allocation.create'}>
                        <Button onClick={onCreateAllocation}>
                            <PlusIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                            New Allocation
                        </Button>
                    </Can>
                )}
            </ListHeader>
            <SpinnerOverlay visible={loading} />
            {!data ? (
                <Spinner size={'large'} centered />
            ) : (
                data.map((allocation) => (
                    <AllocationRow key={`${allocation.ip}:${allocation.port}`} allocation={allocation} />
                ))
            )}
        </ServerContentBlock>
    );
};

export default NetworkContainer;

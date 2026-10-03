import React, { memo, useCallback, useState } from 'react';
import isEqual from 'react-fast-compare';
import tw from 'twin.macro';
import { ShareIcon, CheckCircleIcon } from '@heroicons/react/solid';
import InputSpinner from '@/components/elements/InputSpinner';
import { Textarea } from '@/components/elements/Input';
import Can from '@/components/elements/Can';
import { Button } from '@/components/elements/button/index';
import GreyRowBox from '@/components/elements/GreyRowBox';
import { Allocation } from '@/api/server/getServer';
import styled from 'styled-components/macro';
import { debounce } from 'debounce';
import setServerAllocationNotes from '@/api/server/network/setServerAllocationNotes';
import { useFlashKey } from '@/plugins/useFlash';
import { ServerContext } from '@/state/server';
import CopyOnClick from '@/components/elements/CopyOnClick';
import DeleteAllocationButton from '@/components/server/network/DeleteAllocationButton';
import setPrimaryServerAllocation from '@/api/server/network/setPrimaryServerAllocation';
import getServerAllocations from '@/api/swr/getServerAllocations';
import { ip } from '@/lib/formatters';
import Code from '@/components/elements/Code';

const Label = styled.label`
    ${tw`uppercase text-2xs tracking-wide mb-1 text-neutral-400 block select-none`}
`;

interface Props {
    allocation: Allocation;
}

const AllocationRow = ({ allocation }: Props) => {
    const [loading, setLoading] = useState(false);
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('server:network');
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const { mutate } = getServerAllocations();

    const onNotesChanged = useCallback((id: number, notes: string) => {
        mutate((data) => data?.map((a) => (a.id === id ? { ...a, notes } : a)), false);
    }, []);

    const setAllocationNotes = debounce((notes: string) => {
        setLoading(true);
        clearFlashes();

        setServerAllocationNotes(uuid, allocation.id, notes)
            .then(() => onNotesChanged(allocation.id, notes))
            .catch((error) => clearAndAddHttpError(error))
            .then(() => setLoading(false));
    }, 750);

    const setPrimaryAllocation = () => {
        clearFlashes();
        mutate((data) => data?.map((a) => ({ ...a, isDefault: a.id === allocation.id })), false);

        setPrimaryServerAllocation(uuid, allocation.id).catch((error) => {
            clearAndAddHttpError(error);
            mutate();
        });
    };

    return (
        <GreyRowBox $hoverable={false} className={'flex-wrap md:flex-nowrap mb-3'}>
            <div className={'flex items-center w-full md:w-auto'}>
                <div className={'icon mr-5 !w-12 !h-12'}>
                    <ShareIcon css={tw`w-5 h-5`} />
                </div>
                <div className={'mr-4 flex-1 md:w-44'}>
                    <Label>{allocation.alias ? 'Hostname' : 'IP Address'}</Label>
                    {allocation.alias ? (
                        <CopyOnClick text={allocation.alias}>
                            <Code dark className={'max-w-[11rem] truncate'}>
                                {allocation.alias}
                            </Code>
                        </CopyOnClick>
                    ) : (
                        <CopyOnClick text={ip(allocation.ip)}>
                            <Code dark>{ip(allocation.ip)}</Code>
                        </CopyOnClick>
                    )}
                </div>
                <div className={'w-16 md:w-24 overflow-hidden'}>
                    <Label>Port</Label>
                    <Code dark>{allocation.port}</Code>
                </div>
            </div>
            {allocation.isDefault && (
                <span
                    css={tw`hidden md:inline-flex items-center rounded-full bg-green-50 text-green-700 border border-green-200 px-3 py-1 text-xs font-medium mx-4`}
                >
                    <CheckCircleIcon css={tw`w-4 h-4 mr-1.5`} />
                    Primary
                </span>
            )}
            <div className={'mt-4 w-full md:mt-0 md:flex-1 md:w-auto'}>
                <InputSpinner visible={loading}>
                    <Textarea
                        className={'!bg-neutral-900'}
                        rows={1}
                        placeholder={'Add a note...'}
                        defaultValue={allocation.notes || undefined}
                        onChange={(e) => setAllocationNotes(e.currentTarget.value)}
                    />
                </InputSpinner>
            </div>
            {!allocation.isDefault && (
                <div className={'flex justify-end items-center space-x-3 mt-4 w-full md:mt-0 md:w-auto md:ml-4'}>
                    <Can action={'allocation.update'}>
                        <Button.Text size={Button.Sizes.Small} onClick={setPrimaryAllocation}>
                            Make Primary
                        </Button.Text>
                    </Can>
                    <Can action={'allocation.delete'}>
                        <DeleteAllocationButton allocation={allocation.id} />
                    </Can>
                </div>
            )}
        </GreyRowBox>
    );
};

export default memo(AllocationRow, isEqual);

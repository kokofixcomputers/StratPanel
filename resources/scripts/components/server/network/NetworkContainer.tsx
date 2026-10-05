import React, { useEffect, useState } from 'react';
import Spinner from '@/components/elements/Spinner';
import useFlash, { useFlashKey } from '@/plugins/useFlash';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { ServerContext } from '@/state/server';
import AllocationRow from '@/components/server/network/AllocationRow';
import { Button } from '@/components/elements/button/index';
import createServerAllocation from '@/api/server/network/createServerAllocation';
import tw from 'twin.macro';
import { ShareIcon } from '@heroicons/react/outline';
import { MicrophoneIcon, PlusIcon } from '@heroicons/react/solid';
import PageHeader, { ListHeader } from '@/components/elements/PageHeader';
import Can from '@/components/elements/Can';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import getServerAllocations from '@/api/swr/getServerAllocations';
import isEqual from 'react-fast-compare';
import { useDeepCompareEffect } from '@/plugins/useDeepCompareEffect';
import saveFileContents from '@/api/server/files/saveFileContents';
import setServerAllocationNotes from '@/api/server/network/setServerAllocationNotes';
import { detectVoiceChat, VoiceChat, withAllocation } from '@/lib/voicechat';

const NetworkContainer = () => {
    const [loading, setLoading] = useState(false);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const allocationLimit = ServerContext.useStoreState((state) => state.server.data!.featureLimits.allocations);
    const allocations = ServerContext.useStoreState((state) => state.server.data!.allocations, isEqual);
    const setServerFromState = ServerContext.useStoreActions((actions) => actions.server.setServerFromState);

    const { clearFlashes, clearAndAddHttpError, addError } = useFlashKey('server:network');
    const { addFlash } = useFlash();
    const [voiceChat, setVoiceChat] = useState<VoiceChat | null>(null);
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

    useEffect(() => {
        detectVoiceChat(uuid)
            .then(setVoiceChat)
            .catch(() => setVoiceChat(null));
    }, [uuid]);

    // Voice chat needs a port of its own: take a new allocation and point its config at it.
    const onAddVoiceChatPort = async () => {
        if (!voiceChat) return;

        clearFlashes();
        setLoading(true);
        try {
            const allocation = await createServerAllocation(uuid);
            setServerFromState((s) => ({ ...s, allocations: s.allocations.concat(allocation) }));
            await mutate(data?.concat(allocation), false);

            try {
                await saveFileContents(
                    uuid,
                    voiceChat.path,
                    withAllocation(voiceChat.content, allocation.port, allocation.alias || allocation.ip)
                );
                setVoiceChat({
                    ...voiceChat,
                    content: withAllocation(voiceChat.content, allocation.port, allocation.alias || allocation.ip),
                    port: allocation.port,
                });
                await setServerAllocationNotes(uuid, allocation.id, 'Simple Voice Chat').catch(() => undefined);
                addFlash({
                    key: 'server:network',
                    type: 'success',
                    message: `Voice chat now uses port ${allocation.port} and tells players to connect to ${
                        allocation.alias || allocation.ip
                    }:${allocation.port}. Restart the server to apply it. Players need that UDP port open.`,
                });
                mutate();
            } catch (e) {
                addError(
                    `The allocation ${allocation.port} was added, but ${
                        voiceChat.path
                    } could not be updated. Set port=${allocation.port} and voice_host=${
                        allocation.alias || allocation.ip
                    }:${allocation.port} there yourself.`
                );
            }
        } catch (e) {
            clearAndAddHttpError(e as Error);
        } finally {
            setLoading(false);
        }
    };

    const voicePortInUse =
        !!voiceChat?.port && voiceChat.port > 0 && allocations.some((a) => a.port === voiceChat.port);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);

    return (
        <ServerContentBlock showFlashKey={'server:network'} title={'Network'}>
            <PageHeader title={'Network'} subtitle={`Manage network allocations for ${serverName}`} />
            <ListHeader
                icon={<ShareIcon className={'w-6 h-6'} />}
                title={'Network'}
                count={data ? `${data.length} / ${allocationLimit}` : undefined}
            >
                {voiceChat && (
                    <Can action={['allocation.create', 'file.update']}>
                        <Button.Text
                            disabled={voicePortInUse || !data || allocationLimit <= data.length}
                            onClick={onAddVoiceChatPort}
                            title={
                                voicePortInUse
                                    ? `Voice chat already uses port ${voiceChat.port}`
                                    : 'Add an allocation and set it as the Simple Voice Chat port'
                            }
                        >
                            <MicrophoneIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                            {voicePortInUse ? `Voice chat: ${voiceChat.port}` : 'Add voice chat port'}
                        </Button.Text>
                    </Can>
                )}
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

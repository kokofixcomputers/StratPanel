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
import { MapIcon, MicrophoneIcon, PlusIcon } from '@heroicons/react/solid';
import PageHeader, { ListHeader } from '@/components/elements/PageHeader';
import Can from '@/components/elements/Can';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import getServerAllocations from '@/api/swr/getServerAllocations';
import isEqual from 'react-fast-compare';
import { useDeepCompareEffect } from '@/plugins/useDeepCompareEffect';
import saveFileContents from '@/api/server/files/saveFileContents';
import setServerAllocationNotes from '@/api/server/network/setServerAllocationNotes';
import { detectVoiceChat, VoiceChat, withAllocation } from '@/lib/voicechat';
import { BlueMap, detectBlueMap, withPort } from '@/lib/bluemap';
import { Allocation as ServerAllocation } from '@/api/server/getServer';

type Detected = BlueMap | { path: string; waiting: true } | null;

const NetworkContainer = () => {
    const [loading, setLoading] = useState(false);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const allocationLimit = ServerContext.useStoreState((state) => state.server.data!.featureLimits.allocations);
    const allocations = ServerContext.useStoreState((state) => state.server.data!.allocations, isEqual);
    const setServerFromState = ServerContext.useStoreActions((actions) => actions.server.setServerFromState);

    const { clearFlashes, clearAndAddHttpError, addError } = useFlashKey('server:network');
    const { addFlash } = useFlash();
    const [voiceChat, setVoiceChat] = useState<VoiceChat | null>(null);
    const [blueMap, setBlueMap] = useState<Detected>(null);
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
        detectBlueMap(uuid)
            .then(setBlueMap)
            .catch(() => setBlueMap(null));
    }, [uuid]);

    /**
     * Takes a new allocation and points a service's config at it. The allocation is kept even when the config can not be
     * written, with the line to set by hand in the message.
     */
    const addServicePort = async (service: {
        note: string;
        path: string;
        write: (allocation: ServerAllocation) => Promise<void>;
        success: (allocation: ServerAllocation) => string;
        manual: (allocation: ServerAllocation) => string;
    }) => {
        clearFlashes();
        setLoading(true);
        try {
            const allocation = await createServerAllocation(uuid);
            setServerFromState((s) => ({ ...s, allocations: s.allocations.concat(allocation) }));
            await mutate(data?.concat(allocation), false);

            try {
                await service.write(allocation);
                await setServerAllocationNotes(uuid, allocation.id, service.note).catch(() => undefined);
                addFlash({ key: 'server:network', type: 'success', message: service.success(allocation) });
                mutate();
            } catch (e) {
                addError(
                    `The allocation ${allocation.port} was added, but ${
                        service.path
                    } could not be updated. ${service.manual(allocation)}`
                );
            }
        } catch (e) {
            clearAndAddHttpError(e as Error);
        } finally {
            setLoading(false);
        }
    };

    // Voice chat needs a port of its own: take a new allocation and point its config at it.
    const onAddVoiceChatPort = () => {
        if (!voiceChat) return;
        const address = (a: ServerAllocation) => `${a.alias || a.ip}:${a.port}`;

        return addServicePort({
            note: 'Simple Voice Chat',
            path: voiceChat.path,
            write: async (a) => {
                const content = withAllocation(voiceChat.content, a.port, a.alias || a.ip);
                await saveFileContents(uuid, voiceChat.path, content);
                setVoiceChat({ ...voiceChat, content, port: a.port });
            },
            success: (a) =>
                `Voice chat now uses port ${a.port} and tells players to connect to ${address(
                    a
                )}. Restart the server to apply it. Players need that UDP port open.`,
            manual: (a) => `Set port=${a.port} and voice_host=${address(a)} there yourself.`,
        });
    };

    // BlueMap serves its map from a port of its own as well.
    const onAddBlueMapPort = () => {
        if (!blueMap || 'waiting' in blueMap) return;

        return addServicePort({
            note: 'BlueMap',
            path: blueMap.path,
            write: async (a) => {
                const content = withPort(blueMap.content, a.port);
                await saveFileContents(uuid, blueMap.path, content);
                setBlueMap({ ...blueMap, content, port: a.port });
            },
            success: (a) =>
                `BlueMap now serves its map on port ${a.port}, open http://${a.alias || a.ip}:${
                    a.port
                } once the server has restarted.${
                    blueMap.enabled ? '' : ' Its web server is switched off, set enabled: true in webserver.conf.'
                }`,
            manual: (a) => `Set port: ${a.port} there yourself.`,
        });
    };

    const voicePortInUse =
        !!voiceChat?.port && voiceChat.port > 0 && allocations.some((a) => a.port === voiceChat.port);
    const blueMapPort = blueMap && !('waiting' in blueMap) ? blueMap.port : null;
    const blueMapInUse = !!blueMapPort && allocations.some((a) => a.port === blueMapPort);
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
                {blueMap && (
                    <Can action={['allocation.create', 'file.update']}>
                        <Button.Text
                            disabled={'waiting' in blueMap || blueMapInUse || !data || allocationLimit <= data.length}
                            onClick={onAddBlueMapPort}
                            title={
                                'waiting' in blueMap
                                    ? 'Start the server once so BlueMap writes its webserver.conf'
                                    : blueMapInUse
                                    ? `BlueMap already uses port ${blueMapPort}`
                                    : 'Add an allocation and set it as the BlueMap web server port'
                            }
                        >
                            <MapIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                            {blueMapInUse ? `BlueMap: ${blueMapPort}` : 'Add BlueMap port'}
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

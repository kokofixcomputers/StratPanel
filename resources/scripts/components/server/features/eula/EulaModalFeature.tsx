import React, { useEffect, useState } from 'react';
import { ServerContext } from '@/state/server';
import { Dialog } from '@/components/elements/dialog';
import tw from 'twin.macro';
import saveFileContents from '@/api/server/files/saveFileContents';
import FlashMessageRender from '@/components/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import { SocketEvent, SocketRequest } from '@/components/server/events';

const EulaModalFeature = () => {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const { connected, instance } = ServerContext.useStoreState((state) => state.socket);

    useEffect(() => {
        if (!connected || !instance || status === 'running') return;

        const listener = (line: string) => {
            if (line.toLowerCase().indexOf('you need to agree to the eula in order to run the server') >= 0) {
                setVisible(true);
            }
        };

        instance.addListener(SocketEvent.CONSOLE_OUTPUT, listener);

        return () => {
            instance.removeListener(SocketEvent.CONSOLE_OUTPUT, listener);
        };
    }, [connected, instance, status]);

    const onAcceptEULA = () => {
        setLoading(true);
        clearFlashes('feature:eula');

        saveFileContents(uuid, 'eula.txt', 'eula=true')
            .then(() => {
                if (status === 'offline' && instance) {
                    instance.send(SocketRequest.SET_STATE, 'restart');
                }

                setLoading(false);
                setVisible(false);
            })
            .catch((error) => {
                console.error(error);
                clearAndAddHttpError({ key: 'feature:eula', error });
            })
            .then(() => setLoading(false));
    };

    useEffect(() => {
        clearFlashes('feature:eula');
    }, []);

    return (
        <Dialog.Confirm
            open={visible}
            onClose={() => !loading && setVisible(false)}
            title={'Accept Minecraft® EULA'}
            confirm={loading ? 'Saving...' : 'I Accept'}
            confirmVariant={'primary'}
            onConfirmed={onAcceptEULA}
        >
            <FlashMessageRender key={'feature:eula'} css={tw`mb-4`} />
            <p css={tw`text-sm text-neutral-300 leading-relaxed`}>
                By pressing {'"I Accept"'} below you are indicating your agreement to the&nbsp;
                <a
                    target={'_blank'}
                    css={tw`text-primary-600 underline transition-colors duration-150 hover:text-primary-700`}
                    rel={'noreferrer noopener'}
                    href='https://www.minecraft.net/eula'
                >
                    Minecraft&reg; EULA
                </a>
                .
            </p>
        </Dialog.Confirm>
    );
};

export default EulaModalFeature;

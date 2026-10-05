import React, { useCallback, useEffect, useState } from 'react';
import tw from 'twin.macro';
import { ServerContext } from '@/state/server';
import TitledGreyBox from '@/components/elements/TitledGreyBox';
import Select from '@/components/elements/Select';
import Input from '@/components/elements/Input';
import InputSpinner from '@/components/elements/InputSpinner';
import getServerStartup from '@/api/swr/getServerStartup';
import setSelectedDockerImage from '@/api/server/setSelectedDockerImage';
import useFlash from '@/plugins/useFlash';

/** The Docker image the server runs in, taken from the images its egg offers. */
export default () => {
    const [loading, setLoading] = useState(false);
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const dockerImage = ServerContext.useStoreState((state) => state.server.data!.dockerImage);
    const setServerFromState = ServerContext.useStoreActions((actions) => actions.server.setServerFromState);

    const { data, mutate } = getServerStartup(uuid, undefined);

    useEffect(() => {
        mutate();
    }, []);

    const images = data?.dockerImages || { [dockerImage]: dockerImage };
    const isCustomImage = !Object.values(images)
        .map((v) => v.toLowerCase())
        .includes(dockerImage.toLowerCase());

    const select = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            setLoading(true);
            clearFlashes('settings');

            const image = event.currentTarget.value;
            setSelectedDockerImage(uuid, image)
                .then(() => setServerFromState((s) => ({ ...s, dockerImage: image })))
                .catch((error) => clearAndAddHttpError({ key: 'settings', error }))
                .then(() => setLoading(false));
        },
        [uuid]
    );

    return (
        <TitledGreyBox title={'Docker Image'} css={tw`mb-6 md:mb-10`}>
            {Object.keys(images).length > 1 && !isCustomImage ? (
                <>
                    <InputSpinner visible={loading}>
                        <Select onChange={select} value={dockerImage}>
                            {Object.keys(images).map((key) => (
                                <option key={images[key]} value={images[key]}>
                                    {key}
                                </option>
                            ))}
                        </Select>
                    </InputSpinner>
                    <p css={tw`text-xs text-neutral-300 mt-2`}>
                        This is an advanced feature allowing you to select a Docker image to use when running this
                        server instance. The server has to be restarted to use it.
                    </p>
                </>
            ) : (
                <>
                    <Input disabled readOnly value={dockerImage} />
                    {isCustomImage && (
                        <p css={tw`text-xs text-neutral-300 mt-2`}>
                            This {"server's"} Docker image has been manually set by an administrator and cannot be
                            changed through this UI.
                        </p>
                    )}
                </>
            )}
        </TitledGreyBox>
    );
};

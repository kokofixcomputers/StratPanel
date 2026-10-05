import React, { useEffect } from 'react';
import TitledGreyBox from '@/components/elements/TitledGreyBox';
import tw from 'twin.macro';
import CustomVariablesBox from '@/components/server/startup/CustomVariablesBox';
import VariableBox from '@/components/server/startup/VariableBox';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import getServerStartup from '@/api/swr/getServerStartup';
import Spinner from '@/components/elements/Spinner';
import { ServerError } from '@/components/elements/ScreenBlock';
import { httpErrorToHuman } from '@/api/http';
import { ServerContext } from '@/state/server';
import { useDeepCompareEffect } from '@/plugins/useDeepCompareEffect';
import isEqual from 'react-fast-compare';

const StartupContainer = () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const variables = ServerContext.useStoreState(
        ({ server }) => ({
            variables: server.data!.variables,
            invocation: server.data!.invocation,
            dockerImage: server.data!.dockerImage,
        }),
        isEqual
    );

    const { data, error, isValidating, mutate } = getServerStartup(uuid, {
        ...variables,
        dockerImages: { [variables.dockerImage]: variables.dockerImage },
    });

    const setServerFromState = ServerContext.useStoreActions((actions) => actions.server.setServerFromState);

    useEffect(() => {
        // Since we're passing in initial data this will not trigger on mount automatically. We
        // want to always fetch fresh information from the API however when we're loading the startup
        // information.
        mutate();
    }, []);

    useDeepCompareEffect(() => {
        if (!data) return;

        setServerFromState((s) => ({
            ...s,
            invocation: data.invocation,
            variables: data.variables,
        }));
    }, [data]);

    return !data ? (
        !error || (error && isValidating) ? (
            <Spinner centered size={Spinner.Size.LARGE} />
        ) : (
            <ServerError title={'Oops!'} message={httpErrorToHuman(error)} onRetry={() => mutate()} />
        )
    ) : (
        <ServerContentBlock title={'Environment Variables'}>
            <TitledGreyBox title={'Startup Command'}>
                <div css={tw`px-1 py-2`}>
                    <p
                        css={tw`font-mono text-sm bg-neutral-600 border border-neutral-500 rounded-lg py-3 px-4 break-all`}
                    >
                        {data.invocation}
                    </p>
                </div>
            </TitledGreyBox>
            <h3 css={tw`mt-10 mb-4 text-xl`}>Server variables</h3>
            <div css={tw`grid gap-4 md:grid-cols-2`}>
                {data.variables.map((variable) => (
                    <VariableBox key={variable.envVariable} variable={variable} />
                ))}
            </div>
            <h3 css={tw`mt-10 mb-4 text-xl`}>Your own variables</h3>
            <CustomVariablesBox />
        </ServerContentBlock>
    );
};

export default StartupContainer;

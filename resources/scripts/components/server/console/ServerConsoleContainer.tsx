import React, { memo, useEffect, useState } from 'react';
import { ServerContext } from '@/state/server';
import Can from '@/components/elements/Can';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import isEqual from 'react-fast-compare';
import Spinner from '@/components/elements/Spinner';
import Features from '@feature/Features';
import Console from '@/components/server/console/Console';
import OperatorsCard from '@/components/server/players/OperatorsCard';
import WhitelistCard from '@/components/server/players/WhitelistCard';
import { isProxyServer } from '@/components/server/versions/detectCurrent';
import StatusBadge from '@/components/server/console/StatusBadge';
import PowerButtons from '@/components/server/console/PowerButtons';
import ServerDetailsBlock from '@/components/server/console/ServerDetailsBlock';
import HelperStatus from '@/components/server/console/HelperStatus';
import ShareLogButton from '@/components/server/ShareLogButton';
import { Alert } from '@/components/elements/alert';

export type PowerAction = 'start' | 'stop' | 'restart' | 'kill';

const ServerConsoleContainer = () => {
    const name = ServerContext.useStoreState((state) => state.server.data!.name);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    // Proxies such as Velocity have no operators or whitelist, so those cards are hidden for them.
    const [isProxy, setIsProxy] = useState<boolean | null>(null);

    useEffect(() => {
        const check = () =>
            isProxyServer(uuid)
                .then(setIsProxy)
                .catch(() => setIsProxy(false));

        check();
        window.addEventListener('pterodactyl:software-changed', check);

        return () => window.removeEventListener('pterodactyl:software-changed', check);
    }, [uuid]);
    const description = ServerContext.useStoreState((state) => state.server.data!.description);
    const isInstalling = ServerContext.useStoreState((state) => state.server.isInstalling);
    const isTransferring = ServerContext.useStoreState((state) => state.server.data!.isTransferring);
    const eggFeatures = ServerContext.useStoreState((state) => state.server.data!.eggFeatures, isEqual);
    const isNodeUnderMaintenance = ServerContext.useStoreState((state) => state.server.data!.isNodeUnderMaintenance);

    return (
        <ServerContentBlock title={'Console'}>
            {(isNodeUnderMaintenance || isInstalling || isTransferring) && (
                <Alert type={'warning'} className={'mb-4'}>
                    {isNodeUnderMaintenance
                        ? 'The node of this server is currently under maintenance and all actions are unavailable.'
                        : isInstalling
                        ? 'This server is currently running its installation process and most actions are unavailable.'
                        : 'This server is currently being transferred to another node and all actions are unavailable.'}
                </Alert>
            )}
            <div className={'flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6'}>
                <div className={'min-w-0'}>
                    <h1 className={'text-3xl font-bold tracking-tight text-neutral-50 line-clamp-1'}>{name}</h1>
                    {description && <p className={'mt-1 text-sm text-neutral-400 line-clamp-2'}>{description}</p>}
                    <StatusBadge className={'mt-3'} />
                </div>
                <div className={'flex flex-wrap items-center gap-2'}>
                    <Can action={'control.console'}>
                        <HelperStatus />
                    </Can>
                    <Can action={'file.read-content'}>
                        <ShareLogButton file={'/logs/latest.log'} />
                    </Can>
                    <Can action={['control.start', 'control.stop', 'control.restart']} matchAny>
                        <PowerButtons className={'flex flex-wrap gap-2'} />
                    </Can>
                </div>
            </div>
            <ServerDetailsBlock className={'mb-4'} />
            <Spinner.Suspense>
                <Console />
            </Spinner.Suspense>
            {isProxy === false && (
                <Can action={'file.read-content'}>
                    <div className={'grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4'}>
                        <OperatorsCard />
                        <WhitelistCard />
                    </div>
                </Can>
            )}
            <Features enabled={eggFeatures} />
        </ServerContentBlock>
    );
};

export default memo(ServerConsoleContainer, isEqual);

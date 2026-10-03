import React, { useEffect, useState } from 'react';
import { ServerContext } from '@/state/server';
import Spinner from '@/components/elements/Spinner';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { isProxyServer } from '@/components/server/versions/detectCurrent';
import PropertiesEditor from '@/components/server/properties/PropertiesEditor';
import ProxyContainer from '@/components/server/proxy/ProxyContainer';

/**
 * Minecraft servers get the server.properties editor, proxies (Velocity) get the proxy configurator instead.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [proxy, setProxy] = useState<boolean | null>(null);

    useEffect(() => {
        isProxyServer(uuid)
            .then(setProxy)
            .catch(() => setProxy(false));
    }, [uuid]);

    if (proxy === null) {
        return (
            <ServerContentBlock title={'Properties'}>
                <Spinner size={'large'} centered />
            </ServerContentBlock>
        );
    }

    return proxy ? <ProxyContainer /> : <PropertiesEditor />;
};

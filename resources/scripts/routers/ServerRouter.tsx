import TransferListener from '@/components/server/TransferListener';
import React, { useEffect, useState } from 'react';
import { NavLink, Route, Switch, useRouteMatch } from 'react-router-dom';
import NavigationBar from '@/components/NavigationBar';
import TransitionRouter from '@/TransitionRouter';
import JobsDock from '@/components/server/jobs/JobsDock';
import PowerDock from '@/components/server/PowerDock';
import WebsocketHandler from '@/components/server/WebsocketHandler';
import { ServerContext } from '@/state/server';
import { CSSTransition } from 'react-transition-group';
import Can from '@/components/elements/Can';
import Spinner from '@/components/elements/Spinner';
import { NotFound, ServerError } from '@/components/elements/ScreenBlock';
import { httpErrorToHuman } from '@/api/http';
import { useStoreState } from 'easy-peasy';
import SubNavigation from '@/components/elements/SubNavigation';
import ServerSidebar from '@/components/server/ServerSidebar';
import ContentSidebar from '@/components/server/content/ContentSidebar';
import PlayerTracker from '@/components/server/PlayerTracker';
import InstallListener from '@/components/server/InstallListener';
import ErrorBoundary from '@/components/elements/ErrorBoundary';
import { ExternalLinkIcon } from '@heroicons/react/outline';
import { useLocation } from 'react-router';
import ConflictStateRenderer from '@/components/server/ConflictStateRenderer';
import PermissionRoute from '@/components/elements/PermissionRoute';
import routes from '@/routers/routes';
import { getServerPages, useExtensionRegistry } from '@/lib/extensions';
import { ExtensionBoundary } from '@/components/elements/ExtensionSlot';
import { isProxyServer } from '@/components/server/versions/detectCurrent';

export default () => {
    const match = useRouteMatch<{ id: string }>();
    const location = useLocation();

    // Whoever may open every server also gets past a server that is installing or suspended, and may jump to it in the admin area.
    const rootAdmin = useStoreState((state) => state.user.data!.canAccessAllServers);
    const trashEnabled = ServerContext.useStoreState((state) => !!state.server.data?.trash.enabled);
    const adminArea = useStoreState((state) => state.user.data!.canAccessAdmin);
    const [error, setError] = useState('');
    const [isProxy, setIsProxy] = useState(false);

    const id = ServerContext.useStoreState((state) => state.server.data?.id);
    const uuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
    const inConflictState = ServerContext.useStoreState((state) => state.server.inConflictState);
    const serverId = ServerContext.useStoreState((state) => state.server.data?.internalId);
    const getServer = ServerContext.useStoreActions((actions) => actions.server.getServer);
    const clearServerState = ServerContext.useStoreActions((actions) => actions.clearServerState);

    // Proxies (Velocity) get a proxy configurator instead of server.properties, so label the tab accordingly.
    useEffect(() => {
        if (!uuid) return;

        const check = () =>
            isProxyServer(uuid)
                .then(setIsProxy)
                .catch(() => setIsProxy(false));

        check();
        window.addEventListener('pterodactyl:software-changed', check);

        return () => window.removeEventListener('pterodactyl:software-changed', check);
    }, [uuid]);

    // While Content is open its filters take the place of the server navigation, so it knows nothing of the page it is on.
    const inContent = location.pathname.startsWith(`${match.url.replace(/\/*$/, '')}/mods`);

    // The pages that extensions add to the menu of a server, after the ones of the panel. Made again only when an extension adds
    // one, otherwise a page would start from nothing every time the router renders.
    const extensionVersion = useExtensionRegistry();
    const extensionRoutes = React.useMemo(
        () =>
            getServerPages().map((page) => {
                const Page = page.component;

                return {
                    path: `/ext/${page.extension}/${page.path}`,
                    name: page.label,
                    permission: page.permission ?? null,
                    exact: false,
                    component: () => (
                        <ExtensionBoundary extension={page.extension}>
                            <Page server={{ id, uuid }} />
                        </ExtensionBoundary>
                    ),
                };
            }),
        [extensionVersion, id, uuid]
    );
    const serverRoutes = [...routes.server, ...extensionRoutes];

    const to = (value: string, url = false) => {
        if (value === '/') {
            return url ? match.url : match.path;
        }
        return `${(url ? match.url : match.path).replace(/\/*$/, '')}/${value.replace(/^\/+/, '')}`;
    };

    useEffect(
        () => () => {
            clearServerState();
        },
        []
    );

    useEffect(() => {
        setError('');

        getServer(match.params.id).catch((error) => {
            console.error(error);
            setError(httpErrorToHuman(error));
        });

        return () => {
            clearServerState();
        };
    }, [match.params.id]);

    return (
        <React.Fragment key={'server-router'}>
            <NavigationBar />
            {!uuid || !id ? (
                error ? (
                    <ServerError message={error} />
                ) : (
                    <Spinner size={'large'} centered />
                )
            ) : (
                <>
                    <CSSTransition timeout={150} classNames={'fade'} appear in>
                        <SubNavigation className={'app-subnav lg:hidden'}>
                            <div>
                                {serverRoutes
                                    .filter((route) => !!route.name)
                                    // The trash bin is on the menu while it is on.
                                    .filter((route) => route.path !== '/trash' || trashEnabled)
                                    // Proxies have no player list of their own to manage.
                                    .filter(
                                        (route) => !(isProxy && (route.path === '/players' || route.path === '/tools'))
                                    )
                                    .map((route) =>
                                        route.permission ? (
                                            <Can key={route.path} action={route.permission} matchAny>
                                                <NavLink to={to(route.path, true)} exact={route.exact}>
                                                    {route.path === '/properties' && isProxy ? 'Proxy' : route.name}
                                                </NavLink>
                                            </Can>
                                        ) : (
                                            <NavLink key={route.path} to={to(route.path, true)} exact={route.exact}>
                                                {route.name}
                                            </NavLink>
                                        )
                                    )}
                                {adminArea && (
                                    // eslint-disable-next-line react/jsx-no-target-blank
                                    <a href={`/admin/servers/view/${serverId}`} target={'_blank'}>
                                        <ExternalLinkIcon />
                                    </a>
                                )}
                            </div>
                        </SubNavigation>
                    </CSSTransition>
                    <InstallListener />
                    <TransferListener />
                    <WebsocketHandler />
                    <PlayerTracker />
                    <JobsDock />
                    <PowerDock />
                    <div className={'lg:flex'}>
                        {inContent ? (
                            <ContentSidebar backUrl={to('/', true)} />
                        ) : (
                            <ServerSidebar
                                items={serverRoutes
                                    .filter(
                                        (route) =>
                                            !!route.name &&
                                            (route.path !== '/trash' || trashEnabled) &&
                                            !(isProxy && (route.path === '/players' || route.path === '/tools'))
                                    )
                                    .map((route) => ({
                                        path: route.path,
                                        url: to(route.path, true),
                                        label: route.path === '/properties' && isProxy ? 'Proxy' : route.name!,
                                        permission: route.permission,
                                        exact: route.exact,
                                    }))}
                                adminUrl={adminArea ? `/admin/servers/view/${serverId}` : undefined}
                                playersUrl={isProxy ? undefined : to('/players', true)}
                            />
                        )}
                        <div className={'min-w-0 flex-1 lg:px-4'}>
                            {inConflictState &&
                            (!rootAdmin || (rootAdmin && !location.pathname.endsWith(`/server/${id}`))) ? (
                                <ConflictStateRenderer />
                            ) : (
                                <ErrorBoundary>
                                    <TransitionRouter>
                                        <Switch location={location}>
                                            {serverRoutes.map(({ path, permission, component: Component }) => (
                                                <PermissionRoute
                                                    key={path}
                                                    permission={permission}
                                                    path={to(path)}
                                                    exact
                                                >
                                                    <Spinner.Suspense>
                                                        <Component />
                                                    </Spinner.Suspense>
                                                </PermissionRoute>
                                            ))}
                                            <Route path={'*'} component={NotFound} />
                                        </Switch>
                                    </TransitionRouter>
                                </ErrorBoundary>
                            )}
                        </div>
                    </div>
                </>
            )}
        </React.Fragment>
    );
};

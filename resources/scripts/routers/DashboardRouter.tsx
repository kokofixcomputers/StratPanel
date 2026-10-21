import React from 'react';
import { NavLink, Route, Switch } from 'react-router-dom';
import NavigationBar from '@/components/NavigationBar';
import CreateServerContainer from '@/components/dashboard/CreateServerContainer';
import DashboardContainer from '@/components/dashboard/DashboardContainer';
import { NotFound } from '@/components/elements/ScreenBlock';
import TransitionRouter from '@/TransitionRouter';
import SubNavigation from '@/components/elements/SubNavigation';
import { useLocation } from 'react-router';
import Spinner from '@/components/elements/Spinner';
import routes from '@/routers/routes';
import AccountSidebar from '@/components/dashboard/AccountSidebar';
import DashboardSidebar, { useDashboardSidebarOn } from '@/components/dashboard/DashboardSidebar';

export default () => {
    const location = useLocation();
    const isAccount = location.pathname.startsWith('/account');
    // Outside of servers and of the account pages, a sidebar if the theme has one.
    const sidebarOn = useDashboardSidebarOn();
    const side = !isAccount && sidebarOn;

    return (
        <>
            <NavigationBar />
            {isAccount && (
                <SubNavigation className={'app-subnav lg:hidden'}>
                    <div>
                        {routes.account
                            .filter((route) => !!route.name)
                            .map(({ path, name, exact = false }) => (
                                <NavLink key={path} to={`/account/${path}`.replace('//', '/')} exact={exact}>
                                    {name}
                                </NavLink>
                            ))}
                    </div>
                </SubNavigation>
            )}
            <div className={isAccount || side ? 'lg:flex' : undefined}>
                {isAccount && <AccountSidebar />}
                {side && <DashboardSidebar />}
                <div className={isAccount || side ? 'min-w-0 flex-1 lg:px-4' : undefined}>
                    <TransitionRouter>
                        <React.Suspense fallback={<Spinner centered />}>
                            <Switch location={location}>
                                <Route path={'/'} exact>
                                    <DashboardContainer />
                                </Route>
                                <Route path={'/create'} exact>
                                    <CreateServerContainer />
                                </Route>
                                {routes.account.map(({ path, component: Component }) => (
                                    <Route key={path} path={`/account/${path}`.replace('//', '/')} exact>
                                        <Component />
                                    </Route>
                                ))}
                                <Route path={'*'}>
                                    <NotFound />
                                </Route>
                            </Switch>
                        </React.Suspense>
                    </TransitionRouter>
                </div>
            </div>
        </>
    );
};

import React from 'react';
import { NavLink, Redirect, Route, Switch, useLocation } from 'react-router-dom';
import NavigationBar from '@/components/NavigationBar';
import SubNavigation from '@/components/elements/SubNavigation';
import Spinner from '@/components/elements/Spinner';
import PageContentBlock from '@/components/elements/PageContentBlock';
import { NotFound } from '@/components/elements/ScreenBlock';
import TransitionRouter from '@/TransitionRouter';
import AdminSidebar from '@/components/admin/AdminSidebar';
import UiUpdateNotice from '@/components/admin/UiUpdateNotice';
import useAdmin from '@/plugins/useAdmin';
import { adminUrl, firstPage, PAGES, pageUrl } from '@/lib/adminNav';
import { ADMIN_ROUTES } from '@/routers/adminRoutes';

const Forbidden = () => (
    <PageContentBlock title={'Not allowed'}>
        <div className={'rounded-xl border border-neutral-500 bg-white p-8 text-center shadow-md'}>
            <h1 className={'text-2xl font-bold text-neutral-50'}>Not allowed</h1>
            <p className={'mt-2 text-neutral-400'}>Your roles do not include this page of the admin area.</p>
        </div>
    </PageContentBlock>
);

export default () => {
    const location = useLocation();
    const admin = useAdmin();
    const canAccess = admin.root || admin.permissions.length > 0;
    const pages = PAGES.filter((page) => admin.canOpen(page));

    if (!canAccess) {
        return (
            <>
                <NavigationBar />
                <Forbidden />
            </>
        );
    }

    return (
        <>
            <NavigationBar />
            <SubNavigation className={'app-subnav lg:hidden'}>
                <div>
                    {pages.map((page) =>
                        page.ported ? (
                            <NavLink
                                key={page.key}
                                to={pageUrl(page, admin.permissions, admin.root)}
                                isActive={(_, loc) =>
                                    page.path === ''
                                        ? loc.pathname === '/admin'
                                        : loc.pathname.startsWith(adminUrl(page.path))
                                }
                            >
                                {page.name}
                            </NavLink>
                        ) : (
                            <a key={page.key} href={pageUrl(page, admin.permissions, admin.root)}>
                                {page.name}
                            </a>
                        )
                    )}
                </div>
            </SubNavigation>
            <div className={'lg:flex'}>
                <AdminSidebar />
                <div className={'min-w-0 flex-1 lg:px-4'}>
                    {admin.root && <UiUpdateNotice />}
                    <TransitionRouter>
                        <React.Suspense fallback={<Spinner centered />}>
                            <Switch location={location}>
                                {ADMIN_ROUTES.map(({ path, permissions, component: Component }) => (
                                    <Route key={path} path={path} exact>
                                        {admin.can(...permissions) ? (
                                            <Component />
                                        ) : path === '/admin' ? (
                                            // Somebody whose roles have no overview lands on the first page they may open.
                                            <Redirect to={adminUrl(firstPage(admin.permissions, admin.root)?.path)} />
                                        ) : (
                                            <Forbidden />
                                        )}
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

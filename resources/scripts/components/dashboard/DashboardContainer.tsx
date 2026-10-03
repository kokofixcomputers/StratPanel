import React, { useEffect, useState } from 'react';
import { Server } from '@/api/server/getServer';
import getServers from '@/api/getServers';
import ServerRow from '@/components/dashboard/ServerRow';
import Spinner from '@/components/elements/Spinner';
import PageContentBlock from '@/components/elements/PageContentBlock';
import useFlash from '@/plugins/useFlash';
import { useStoreState } from 'easy-peasy';
import { usePersistedState } from '@/plugins/usePersistedState';
import Switch from '@/components/elements/Switch';
import tw from 'twin.macro';
import useSWR from 'swr';
import { PaginatedResult } from '@/api/http';
import Pagination from '@/components/elements/Pagination';
import { Link, useLocation } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/solid';
import Button from '@/components/elements/Button';
import { getSelfService, SelfService } from '@/api/selfService';

export default () => {
    const { search } = useLocation();
    const defaultPage = Number(new URLSearchParams(search).get('page') || '1');

    const [page, setPage] = useState(!isNaN(defaultPage) && defaultPage > 0 ? defaultPage : 1);
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const uuid = useStoreState((state) => state.user.data!.uuid);
    const rootAdmin = useStoreState((state) => state.user.data!.rootAdmin);
    const [showOnlyAdmin, setShowOnlyAdmin] = usePersistedState(`${uuid}:show_all_servers`, false);

    const { data: servers, error } = useSWR<PaginatedResult<Server>>(
        ['/api/client/servers', showOnlyAdmin && rootAdmin, page],
        () => getServers({ page, type: showOnlyAdmin && rootAdmin ? 'admin' : undefined })
    );

    useEffect(() => {
        setPage(1);
    }, [showOnlyAdmin]);

    useEffect(() => {
        if (!servers) return;
        if (servers.pagination.currentPage > 1 && !servers.items.length) {
            setPage(1);
        }
    }, [servers?.pagination.currentPage]);

    useEffect(() => {
        // Don't use react-router to handle changing this part of the URL, otherwise it
        // triggers a needless re-render. We just want to track this in the URL incase the
        // user refreshes the page.
        window.history.replaceState(null, document.title, `/${page <= 1 ? '' : `?page=${page}`}`);
    }, [page]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'dashboard', error });
        if (!error) clearFlashes('dashboard');
    }, [error]);

    const [selfService, setSelfService] = useState<SelfService | null>(null);
    useEffect(() => {
        getSelfService()
            .then(setSelfService)
            .catch(() => setSelfService(null));
    }, []);

    return (
        <PageContentBlock title={'Dashboard'} showFlashKey={'dashboard'}>
            <div css={tw`flex flex-wrap items-end justify-between gap-4 mb-6`}>
                <div>
                    <h1 css={tw`text-3xl font-bold tracking-tight text-neutral-50`}>Your servers</h1>
                    <p css={tw`mt-1 text-neutral-400`}>
                        {servers
                            ? `${servers.pagination.total} server${servers.pagination.total === 1 ? '' : 's'} ${
                                  showOnlyAdmin && rootAdmin ? 'owned by other users' : 'on your account'
                              }`
                            : 'Loading your servers...'}
                    </p>
                </div>
                <div css={tw`flex items-center gap-4`}>
                    {rootAdmin && (
                        <label css={tw`flex items-center text-sm text-neutral-300 cursor-pointer select-none`}>
                            <span css={tw`mr-3`}>{showOnlyAdmin ? "Others' servers" : 'My servers'}</span>
                            <Switch
                                name={'show_all_servers'}
                                defaultChecked={showOnlyAdmin}
                                onChange={() => setShowOnlyAdmin((s) => !s)}
                            />
                        </label>
                    )}
                    {selfService?.enabled && (
                        <Link to={'/create'} css={tw`no-underline`}>
                            <Button disabled={!selfService.canCreate} type={'button'}>
                                <PlusIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                                Create new
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
            {!servers ? (
                <Spinner centered size={'large'} />
            ) : (
                <Pagination data={servers} onPageSelect={setPage}>
                    {({ items }) =>
                        items.length > 0 ? (
                            items.map((server, index) => (
                                <ServerRow key={server.uuid} server={server} css={index > 0 ? tw`mt-3` : undefined} />
                            ))
                        ) : (
                            <div
                                css={tw`bg-white border border-dashed border-neutral-400 rounded-xl py-14 px-6 text-center`}
                            >
                                <p css={tw`text-neutral-100 font-medium`}>
                                    {showOnlyAdmin ? 'There are no other servers to display.' : 'No servers yet'}
                                </p>
                                {!showOnlyAdmin && (
                                    <p css={tw`text-sm text-neutral-400 mt-1`}>
                                        {selfService?.canCreate
                                            ? 'Create your first Minecraft server in under a minute.'
                                            : 'There are no servers associated with your account.'}
                                    </p>
                                )}
                            </div>
                        )
                    }
                </Pagination>
            )}
        </PageContentBlock>
    );
};

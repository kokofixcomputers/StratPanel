import * as React from 'react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogoutIcon, ViewGridIcon, AdjustmentsIcon } from '@heroicons/react/outline';
import { useStoreState } from 'easy-peasy';
import { ApplicationStore } from '@/state';
import CommandPalette from '@/components/palette/CommandPalette';
import tw from 'twin.macro';
import styled from 'styled-components/macro';
import http from '@/api/http';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import Avatar from '@/components/Avatar';
import PanelLogo from '@/components/elements/PanelLogo';
import useBranding from '@/plugins/useBranding';
import { linksAt } from '@/lib/branding';
import ThemeToggle from '@/components/elements/ThemeToggle';
import PrivacyBadge from '@/components/elements/PrivacyBadge';

const RightNavigation = styled.div`
    ${tw`flex items-center space-x-1`};

    & > a,
    & > button,
    & > .navigation-link {
        ${tw`flex items-center justify-center w-9 h-9 rounded-lg no-underline text-neutral-300 cursor-pointer transition-colors duration-150`};

        & > svg {
            ${tw`w-5 h-5`};
        }

        &:active,
        &:hover {
            ${tw`text-neutral-50 bg-neutral-600`};
        }

        &.active {
            ${tw`text-primary-600 bg-primary-50`};
        }
    }
`;

export default () => {
    const name = useStoreState((state: ApplicationStore) => state.settings.data!.name);
    const rootAdmin = useStoreState((state: ApplicationStore) => state.user.data!.canAccessAdmin);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const navbarLinks = linksAt(useBranding().links, 'navbar');

    const onTriggerLogout = () => {
        setIsLoggingOut(true);
        http.post('/auth/logout').finally(() => {
            // @ts-expect-error this is valid
            window.location = '/';
        });
    };

    return (
        <div className={'app-nav w-full bg-white border-b border-neutral-500'}>
            <SpinnerOverlay visible={isLoggingOut} fixed />
            <div className={'mx-auto w-full flex items-center h-14 max-w-[1280px] px-4'}>
                <div id={'logo'} className={'flex-1'}>
                    <Link
                        to={'/'}
                        className={
                            'inline-flex items-center text-base font-semibold tracking-tight no-underline text-neutral-50'
                        }
                    >
                        <PanelLogo className={'w-8 h-8 mr-2.5 object-contain'} />
                        {name}
                    </Link>
                </div>
                {navbarLinks.length > 0 && (
                    <div className={'mr-2 hidden items-center space-x-1 md:flex'}>
                        {navbarLinks.map((custom, index) => (
                            <a
                                key={`${custom.url}:${index}`}
                                href={custom.url}
                                target={custom.newTab ? '_blank' : undefined}
                                rel={'noopener noreferrer'}
                                className={
                                    'rounded-lg px-3 py-1.5 text-sm font-medium no-underline text-neutral-300 transition-colors duration-150 hover:bg-neutral-600 hover:text-neutral-50'
                                }
                            >
                                {custom.label}
                            </a>
                        ))}
                    </div>
                )}
                <CommandPalette />
                <RightNavigation className={'nav-right'}>
                    <Tooltip placement={'bottom'} content={'Dashboard'}>
                        <NavLink to={'/'} exact>
                            <ViewGridIcon />
                        </NavLink>
                    </Tooltip>
                    {rootAdmin && (
                        <Tooltip placement={'bottom'} content={'Admin'}>
                            <a href={'/admin'} rel={'noreferrer'}>
                                <AdjustmentsIcon />
                            </a>
                        </Tooltip>
                    )}
                    <PrivacyBadge />
                    <ThemeToggle />
                    <Tooltip placement={'bottom'} content={'Account Settings'}>
                        <NavLink to={'/account'}>
                            <span className={'flex items-center w-6 h-6 rounded-full overflow-hidden'}>
                                <Avatar.User />
                            </span>
                        </NavLink>
                    </Tooltip>
                    <Tooltip placement={'bottom'} content={'Sign Out'}>
                        <button onClick={onTriggerLogout}>
                            <LogoutIcon />
                        </button>
                    </Tooltip>
                </RightNavigation>
            </div>
        </div>
    );
};

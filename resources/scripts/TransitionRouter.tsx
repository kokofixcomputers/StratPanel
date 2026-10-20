import React from 'react';
import { Route } from 'react-router';
import { SwitchTransition } from 'react-transition-group';
import Fade from '@/components/elements/Fade';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import { useThemeConfig } from '@/lib/themeConfig';

const StyledSwitchTransition = styled(SwitchTransition)`
    ${tw`relative`};

    & section {
        ${tw`absolute w-full top-0 left-0`};
    }
`;

const TransitionRouter: React.FC = ({ children }) => {
    const page = useThemeConfig().motion.page;

    return (
        <Route
            render={({ location }) => (
                <StyledSwitchTransition>
                    <Fade
                        timeout={page === 'fade' ? 150 : 0}
                        key={location.pathname + location.search}
                        in
                        appear
                        unmountOnExit
                    >
                        <section>{children}</section>
                    </Fade>
                </StyledSwitchTransition>
            )}
        />
    );
};

export default TransitionRouter;

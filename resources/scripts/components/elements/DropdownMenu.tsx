import React, { createRef } from 'react';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import Fade from '@/components/elements/Fade';
import Portal from '@/components/elements/Portal';

interface Props {
    children: React.ReactNode;
    renderToggle: (onClick: (e: React.MouseEvent<any, MouseEvent>) => void) => React.ReactChild;
}

export const DropdownButtonRow = styled.button<{ danger?: boolean }>`
    ${tw`px-3 py-2 flex items-center rounded-lg w-full text-sm text-neutral-200`};
    transition: 150ms all ease;

    &:hover {
        ${(props) => (props.danger ? tw`text-red-700 bg-red-50` : tw`text-neutral-50 bg-neutral-600`)};
    }
`;

interface State {
    // Where the menu is anchored in the window: its right edge and the top, or the bottom of the toggle.
    posX: number;
    posY: number;
    // Where an upward menu ends, the top of the toggle.
    posTop: number;
    visible: boolean;
}

const MARGIN = 8;

class DropdownMenu extends React.PureComponent<Props, State> {
    menu = createRef<HTMLDivElement>();

    state: State = {
        posX: 0,
        posY: 0,
        posTop: 0,
        visible: false,
    };

    componentWillUnmount() {
        this.removeListeners();
    }

    // The menu sits outside of any container (a table that clips its content, a scrolling area) and is positioned
    // against the window, so it is never cut off. It follows the window when that scrolls by closing instead.
    closeOnScroll = () => this.setState({ visible: false });

    componentDidUpdate(prevProps: Readonly<Props>, prevState: Readonly<State>) {
        const menu = this.menu.current;

        if (this.state.visible && !prevState.visible && menu) {
            document.addEventListener('click', this.windowListener);
            document.addEventListener('contextmenu', this.contextMenuListener);
            window.addEventListener('scroll', this.closeOnScroll, true);
            window.addEventListener('resize', this.closeOnScroll);

            const { clientWidth: width, clientHeight: height } = menu;
            const left = Math.min(Math.max(this.state.posX - width, MARGIN), window.innerWidth - width - MARGIN);
            // Below the anchor, or above it when there is no room underneath.
            const below = this.state.posY + height + MARGIN <= window.innerHeight;
            const top = below ? this.state.posY : Math.max(this.state.posTop - height, MARGIN);
            menu.style.left = `${Math.round(left)}px`;
            menu.style.top = `${Math.round(top)}px`;
        }

        if (!this.state.visible && prevState.visible) {
            this.removeListeners();
        }
    }

    removeListeners = () => {
        document.removeEventListener('click', this.windowListener);
        document.removeEventListener('contextmenu', this.contextMenuListener);
        window.removeEventListener('scroll', this.closeOnScroll, true);
        window.removeEventListener('resize', this.closeOnScroll);
    };

    onClickHandler = (e: React.MouseEvent<any, MouseEvent>) => {
        e.preventDefault();
        // Anchor under the toggle, with the menu ending at its right edge.
        const toggle = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
        this.triggerMenu(
            toggle ? toggle.right : e.clientX,
            toggle ? toggle.bottom + 4 : e.clientY,
            toggle ? toggle.top - 4 : e.clientY
        );
    };

    contextMenuListener = () => this.setState({ visible: false });

    windowListener = (e: MouseEvent) => {
        const menu = this.menu.current;

        if (e.button === 2 || !this.state.visible || !menu) {
            return;
        }

        if (e.target === menu || menu.contains(e.target as Node)) {
            return;
        }

        if (e.target !== menu && !menu.contains(e.target as Node)) {
            this.setState({ visible: false });
        }
    };

    triggerMenu = (posX: number, posY: number, posTop: number = posY) =>
        this.setState((s) => ({
            posX: !s.visible ? posX : s.posX,
            posY: !s.visible ? posY : s.posY,
            posTop: !s.visible ? posTop : s.posTop,
            visible: !s.visible,
        }));

    render() {
        return (
            <div>
                {this.props.renderToggle(this.onClickHandler)}
                <Portal>
                    <Fade timeout={150} in={this.state.visible} unmountOnExit>
                        <div
                            ref={this.menu}
                            onClick={(e) => {
                                e.stopPropagation();
                                this.setState({ visible: false });
                            }}
                            style={{ width: '12rem', position: 'fixed', left: 0, top: 0 }}
                            css={tw`bg-white p-1.5 rounded-xl border border-neutral-500 shadow-lg text-neutral-300 z-50`}
                        >
                            {this.props.children}
                        </div>
                    </Fade>
                </Portal>
            </div>
        );
    }
}

export default DropdownMenu;

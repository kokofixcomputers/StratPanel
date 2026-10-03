import React, { useEffect, useMemo, useRef, useState } from 'react';
import Spinner from '@/components/elements/Spinner';
import tw from 'twin.macro';
import styled, { css } from 'styled-components/macro';
import { breakpoint } from '@/theme';
import Fade from '@/components/elements/Fade';
import { createPortal } from 'react-dom';

export interface RequiredModalProps {
    visible: boolean;
    onDismissed: () => void;
    appear?: boolean;
    top?: boolean;
}

export interface ModalProps extends RequiredModalProps {
    dismissable?: boolean;
    closeOnEscape?: boolean;
    closeOnBackground?: boolean;
    showSpinnerOverlay?: boolean;
}

export const ModalMask = styled.div`
    ${tw`fixed z-50 overflow-auto flex w-full inset-0`};
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
`;

const ModalContainer = styled.div<{ alignTop?: boolean }>`
    max-width: 95%;
    max-height: calc(100vh - 6rem);
    ${breakpoint('md')`max-width: 640px`};
    ${breakpoint('lg')`max-width: 640px`};

    ${tw`relative flex flex-col w-full m-auto`};
    ${(props) =>
        props.alignTop &&
        css`
            margin-top: 15%;
            ${breakpoint('md')`margin-top: 8%`};
        `};

    margin-bottom: auto;

    & > .close-icon {
        ${tw`absolute z-10 flex items-center justify-center w-9 h-9 rounded-full text-neutral-400 bg-white border border-neutral-500 cursor-pointer transition-all duration-150 hover:text-neutral-50 hover:bg-neutral-600`};
        top: 1rem;
        right: 1rem;

        & > svg {
            ${tw`w-4 h-4`};
        }
    }
`;

const Modal: React.FC<ModalProps> = ({
    visible,
    appear,
    dismissable,
    showSpinnerOverlay,
    top = true,
    closeOnBackground = true,
    closeOnEscape = true,
    onDismissed,
    children,
}) => {
    const [render, setRender] = useState(visible);

    const isDismissable = useMemo(() => {
        return (dismissable || true) && !(showSpinnerOverlay || false);
    }, [dismissable, showSpinnerOverlay]);

    useEffect(() => {
        if (!isDismissable || !closeOnEscape) return;

        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setRender(false);
        };

        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [isDismissable, closeOnEscape, render]);

    useEffect(() => setRender(visible), [visible]);

    return (
        <Fade in={render} timeout={150} appear={appear || true} unmountOnExit onExited={() => onDismissed()}>
            <ModalMask
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                    if (isDismissable && closeOnBackground) {
                        e.stopPropagation();
                        if (e.target === e.currentTarget) {
                            setRender(false);
                        }
                    }
                }}
            >
                <ModalContainer alignTop={top}>
                    {isDismissable && (
                        <div className={'close-icon'} onClick={() => setRender(false)}>
                            <svg
                                xmlns={'http://www.w3.org/2000/svg'}
                                fill={'none'}
                                viewBox={'0 0 24 24'}
                                stroke={'currentColor'}
                            >
                                <path
                                    strokeLinecap={'round'}
                                    strokeLinejoin={'round'}
                                    strokeWidth={'2'}
                                    d={'M6 18L18 6M6 6l12 12'}
                                />
                            </svg>
                        </div>
                    )}
                    {showSpinnerOverlay && (
                        <Fade timeout={150} appear in>
                            <div
                                css={tw`absolute w-full h-full rounded-2xl flex items-center justify-center`}
                                style={{ background: 'rgba(255, 255, 255, 0.7)', zIndex: 9999 }}
                            >
                                <Spinner />
                            </div>
                        </Fade>
                    )}
                    <div
                        css={tw`bg-white p-5 sm:p-6 md:p-8 rounded-2xl border border-neutral-500 shadow-xl overflow-y-auto transition-all duration-150`}
                    >
                        {children}
                    </div>
                </ModalContainer>
            </ModalMask>
        </Fade>
    );
};

const PortaledModal: React.FC<ModalProps> = ({ children, ...props }) => {
    const element = useRef(document.getElementById('modal-portal'));

    return createPortal(<Modal {...props}>{children}</Modal>, element.current!);
};

export default PortaledModal;

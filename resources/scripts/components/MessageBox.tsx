import * as React from 'react';
import tw, { TwStyle } from 'twin.macro';
import styled from 'styled-components/macro';

export type FlashMessageType = 'success' | 'info' | 'warning' | 'error';

interface Props {
    title?: string;
    children: string;
    type?: FlashMessageType;
}

const styling = (type?: FlashMessageType): TwStyle | string => {
    switch (type) {
        case 'error':
            return tw`bg-red-50 border-red-200 text-red-800`;
        case 'info':
            return tw`bg-primary-50 border-primary-200 text-primary-800`;
        case 'success':
            return tw`bg-green-50 border-green-200 text-green-800`;
        case 'warning':
            return tw`bg-yellow-50 border-yellow-200 text-yellow-800`;
        default:
            return tw`bg-white border-neutral-500 text-neutral-200`;
    }
};

const getBackground = (type?: FlashMessageType): TwStyle | string => {
    switch (type) {
        case 'error':
            return tw`bg-red-600 text-white`;
        case 'info':
            return tw`bg-primary-600 text-white`;
        case 'success':
            return tw`bg-green-600 text-white`;
        case 'warning':
            return tw`bg-yellow-500 text-white`;
        default:
            return '';
    }
};

const Container = styled.div<{ $type?: FlashMessageType }>`
    ${tw`px-4 py-3 border items-center leading-normal rounded-xl flex w-full text-sm`};
    ${(props) => styling(props.$type)};
`;
Container.displayName = 'MessageBox.Container';

const MessageBox = ({ title, children, type }: Props) => (
    <Container css={tw`lg:inline-flex`} $type={type} role={'alert'}>
        {title && (
            <span
                className={'title'}
                css={[
                    tw`flex rounded-full uppercase px-2 py-1 text-2xs font-bold mr-3 tracking-wide leading-none`,
                    getBackground(type),
                ]}
            >
                {title}
            </span>
        )}
        <span css={tw`mr-2 text-left flex-auto`}>{children}</span>
    </Container>
);
MessageBox.displayName = 'MessageBox';

export default MessageBox;

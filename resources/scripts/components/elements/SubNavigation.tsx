import styled from 'styled-components/macro';
import tw from 'twin.macro';

const SubNavigation = styled.div`
    ${tw`w-full bg-white border-b border-neutral-500 overflow-x-auto`};
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }

    & > div {
        ${tw`flex items-center text-sm font-medium mx-auto px-2`};
        max-width: 1280px;

        & > a,
        & > div {
            ${tw`relative inline-flex items-center py-4 px-4 text-neutral-400 no-underline whitespace-nowrap transition-colors duration-150`};

            &:hover {
                ${tw`text-neutral-50`};
            }

            &:active,
            &.active {
                ${tw`text-primary-600`};
                box-shadow: inset 0 -2px #1447e6;
            }

            & > svg {
                ${tw`w-4 h-4`};
            }
        }
    }
`;

export default SubNavigation;

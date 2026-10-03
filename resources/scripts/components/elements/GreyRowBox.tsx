import styled from 'styled-components/macro';
import tw from 'twin.macro';

export default styled.div<{ $hoverable?: boolean }>`
    ${tw`flex rounded-xl no-underline text-neutral-200 items-center bg-white p-4 border border-neutral-500 transition-all duration-150 overflow-hidden shadow`};

    ${(props) => props.$hoverable !== false && tw`hover:border-neutral-400 hover:shadow-md`};

    & .icon {
        ${tw`rounded-full w-14 h-14 flex items-center justify-center bg-primary-50 text-primary-600 p-3`};
    }
`;

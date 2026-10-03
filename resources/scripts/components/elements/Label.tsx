import styled from 'styled-components/macro';
import tw from 'twin.macro';

const Label = styled.label<{ isLight?: boolean }>`
    ${tw`block text-sm font-medium text-neutral-200 mb-1.5`};
`;

export default Label;

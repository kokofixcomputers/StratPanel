import styled, { css } from 'styled-components/macro';
import tw from 'twin.macro';

export interface Props {
    isLight?: boolean;
    hasError?: boolean;
}

const light = css<Props>`
    ${tw`bg-white border-neutral-500 text-neutral-100`};
    &:focus {
        ${tw`border-primary-500`}
    }

    &:disabled {
        ${tw`bg-neutral-600 border-neutral-500`};
    }
`;

const checkboxStyle = css<Props>`
    ${tw`bg-white cursor-pointer appearance-none inline-block align-middle select-none flex-shrink-0 w-4 h-4 text-primary-600 border border-neutral-400`};
    border-radius: 0.3rem;
    color-adjust: exact;
    background-origin: border-box;
    transition: all 75ms linear, box-shadow 25ms linear;

    &:checked {
        ${tw`border-transparent bg-no-repeat bg-center`};
        background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M5.707 7.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4a1 1 0 0 0-1.414-1.414L7 8.586 5.707 7.293z'/%3e%3c/svg%3e");
        background-color: currentColor;
        background-size: 100% 100%;
    }

    &:focus {
        ${tw`outline-none border-primary-500`};
        box-shadow: 0 0 0 3px rgba(20, 71, 230, 0.18);
    }
`;

const inputStyle = css<Props>`
    // Reset to normal styling.
    resize: none;
    ${tw`appearance-none outline-none w-full min-w-0`};
    ${tw`px-4 py-3 border rounded-lg text-sm transition-all duration-150`};
    ${tw`bg-white border-neutral-500 hover:border-neutral-400 text-neutral-100 shadow-none focus:ring-0`};

    &::placeholder {
        ${tw`text-neutral-400`};
        opacity: 0.8;
    }

    & + .input-help {
        ${tw`mt-1.5 text-xs`};
        ${(props) => (props.hasError ? tw`text-red-600` : tw`text-neutral-400`)};
    }

    &:required,
    &:invalid {
        ${tw`shadow-none`};
    }

    &:not(:disabled):not(:read-only):focus {
        ${tw`border-primary-500`};
        box-shadow: 0 0 0 3px rgba(20, 71, 230, 0.15);
        ${(props) => props.hasError && tw`border-red-500`};
        ${(props) => props.hasError && 'box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15)'};
    }

    &:disabled {
        ${tw`bg-neutral-600 text-neutral-400`};
        cursor: not-allowed;
    }

    ${(props) => props.isLight && light};
    ${(props) => props.hasError && tw`border-red-500 hover:border-red-500`};
`;

const Input = styled.input<Props>`
    &:not([type='checkbox']):not([type='radio']) {
        ${inputStyle};
    }

    &[type='checkbox'],
    &[type='radio'] {
        ${checkboxStyle};

        &[type='radio'] {
            ${tw`rounded-full`};
        }
    }
`;
const Textarea = styled.textarea<Props>`
    ${inputStyle}
`;

export { Textarea };
export default Input;

import React, { forwardRef } from 'react';
import { Form } from 'formik';
import { CubeTransparentIcon } from '@heroicons/react/outline';
import { useStoreState } from 'easy-peasy';
import FlashMessageRender from '@/components/FlashMessageRender';
import tw from 'twin.macro';

type Props = React.DetailedHTMLProps<React.FormHTMLAttributes<HTMLFormElement>, HTMLFormElement> & {
    title?: string;
};

export default forwardRef<HTMLFormElement, Props>(({ title, ...props }, ref) => {
    const name = useStoreState((state) => state.settings.data?.name);

    return (
        <div className={'flex min-h-screen items-center justify-center px-4 py-10'}>
            <div className={'w-full max-w-md'}>
                <div css={tw`flex flex-col items-center mb-8`}>
                    <span css={tw`flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-600 shadow-md`}>
                        <CubeTransparentIcon css={tw`w-7 h-7 text-white`} />
                    </span>
                    {name && <p css={tw`mt-3 text-sm font-medium text-neutral-300`}>{name}</p>}
                </div>
                <FlashMessageRender css={tw`mb-4`} />
                <Form {...props} ref={ref}>
                    <div css={tw`w-full bg-white border border-neutral-500 shadow-lg rounded-2xl p-6 sm:p-8`}>
                        {title && <h2 css={tw`text-2xl text-center text-neutral-50 font-semibold mb-6`}>{title}</h2>}
                        {props.children}
                    </div>
                </Form>
                <p css={tw`text-center text-neutral-400 text-xs mt-6`}>
                    &copy; 2015 - {new Date().getFullYear()}&nbsp;
                    <a
                        rel={'noopener nofollow noreferrer'}
                        href={'https://pterodactyl.io'}
                        target={'_blank'}
                        css={tw`no-underline text-neutral-400 hover:text-neutral-200`}
                    >
                        Pterodactyl Software
                    </a>
                </p>
            </div>
        </div>
    );
});

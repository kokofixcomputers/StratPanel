import React, { forwardRef } from 'react';
import { Form } from 'formik';
import PanelLogo from '@/components/elements/PanelLogo';
import { useStoreState } from 'easy-peasy';
import FlashMessageRender from '@/components/FlashMessageRender';
import tw from 'twin.macro';

type Props = React.DetailedHTMLProps<React.FormHTMLAttributes<HTMLFormElement>, HTMLFormElement> & {
    title?: string;
    subtitle?: string;
};

/**
 * The page around the sign in, password reset and two factor forms. It is neutral on purpose: the logo and name of the panel
 * (set under Settings > Branding) and the form, nothing that says what the panel is for, since hosts use this page for their own.
 */
export default forwardRef<HTMLFormElement, Props>(({ title, subtitle, ...props }, ref) => {
    const name = useStoreState((state) => state.settings.data?.name);

    return (
        <div className={'flex min-h-screen items-center justify-center px-4 py-10'}>
            <div className={'w-full max-w-sm'}>
                <div className={'mb-6 flex flex-col items-center'}>
                    <PanelLogo className={'h-14 w-14 object-contain'} />
                    {name && <p className={'mt-3 text-lg font-semibold tracking-tight text-neutral-50'}>{name}</p>}
                </div>
                <div className={'rounded-2xl border border-neutral-500 bg-white p-6 shadow-md sm:p-8'}>
                    {title && <h2 css={tw`text-2xl font-bold tracking-tight text-neutral-50`}>{title}</h2>}
                    {subtitle && <p css={tw`mt-1 mb-6 text-sm text-neutral-400`}>{subtitle}</p>}
                    {!subtitle && title && <div css={tw`mb-6`} />}
                    <FlashMessageRender css={tw`mb-4`} />
                    <Form {...props} ref={ref}>
                        {/* The form itself is a flex row for the other screens, keep everything in one column. */}
                        <div className={'w-full'}>{props.children}</div>
                    </Form>
                </div>
                <p css={tw`mt-6 text-center text-xs text-neutral-400`}>
                    {name || 'Panel'} &copy; {new Date().getFullYear()}, built on&nbsp;
                    <a
                        rel={'noopener nofollow noreferrer'}
                        href={'https://pterodactyl.io'}
                        target={'_blank'}
                        css={tw`no-underline text-neutral-400 hover:text-neutral-200`}
                    >
                        Pterodactyl
                    </a>
                </p>
            </div>
        </div>
    );
});

import React, { forwardRef } from 'react';
import { Form } from 'formik';
import classNames from 'classnames';
import { CheckCircleIcon } from '@heroicons/react/solid';
import PanelLogo from '@/components/elements/PanelLogo';
import { useStoreState } from 'easy-peasy';
import FlashMessageRender from '@/components/FlashMessageRender';
import AuthBackground from '@/components/auth/AuthBackground';
import { useThemeConfig } from '@/lib/themeConfig';
import tw from 'twin.macro';

type Props = React.DetailedHTMLProps<React.FormHTMLAttributes<HTMLFormElement>, HTMLFormElement> & {
    title?: string;
    subtitle?: string;
};

/**
 * The page around the sign in, password reset and two factor forms. It is neutral on purpose: the logo and name of the panel
 * (set under Settings > Branding) and the form, nothing that says what the panel is for, since hosts use this page for their own.
 * The theme editor can change the layout and the background (`login` in lib/themeConfig.ts): the form in a card in the middle, a side
 * that says who you are next to it, or the form floating over a full page background.
 */
export default forwardRef<HTMLFormElement, Props>(({ title, subtitle, ...props }, ref) => {
    const name = useStoreState((state) => state.settings.data?.name);
    const login = useThemeConfig().login;
    const year = new Date().getFullYear();

    const heading = (
        <>
            {title && <h2 css={tw`text-2xl font-bold tracking-tight text-neutral-50`}>{title}</h2>}
            {subtitle && <p css={tw`mt-1 mb-6 text-sm text-neutral-400`}>{subtitle}</p>}
            {!subtitle && title && <div css={tw`mb-6`} />}
            <FlashMessageRender css={tw`mb-4`} />
            <Form {...props} ref={ref}>
                {/* The form itself is a flex row for the other screens, keep everything in one column. */}
                <div className={'w-full'}>{props.children}</div>
            </Form>
        </>
    );

    const footer = (
        <p css={tw`mt-6 text-center text-xs text-neutral-400`}>
            {name || 'Panel'} &copy; {year}, built on&nbsp;
            <a
                rel={'noopener nofollow noreferrer'}
                href={'https://pterodactyl.io'}
                target={'_blank'}
                css={tw`no-underline text-neutral-400 hover:text-neutral-200`}
            >
                Pterodactyl
            </a>
        </p>
    );

    const logo = (
        <div className={'mb-6 flex flex-col items-center'}>
            <PanelLogo className={'h-14 w-14 object-contain'} />
            {name && <p className={'mt-3 text-lg font-semibold tracking-tight text-neutral-50'}>{name}</p>}
        </div>
    );

    const card = (glass: boolean) => (
        <div
            className={classNames(
                'rounded-2xl border border-neutral-500 p-6 shadow-md sm:p-8',
                glass ? 'glass bg-white' : 'bg-white'
            )}
        >
            {heading}
        </div>
    );

    // What the brand side and the showcase say.
    const message = (large: boolean) => (
        <div className={'max-w-xl'}>
            <h1
                className={classNames(
                    'font-bold tracking-tight text-neutral-50',
                    large ? 'text-4xl lg:text-5xl' : 'text-3xl'
                )}
            >
                {login.title || name || 'Welcome'}
            </h1>
            {login.tagline && <p className={'mt-4 text-lg text-neutral-200'}>{login.tagline}</p>}
            {login.features.length > 0 && (
                <ul className={'mt-8 hidden space-y-3 lg:block'}>
                    {login.features.map((feature, i) => (
                        <li key={i} className={'flex items-center gap-3 text-neutral-100'}>
                            <CheckCircleIcon className={'h-5 w-5 flex-shrink-0 text-primary-600'} />
                            {feature}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    if (login.layout === 'card') {
        return (
            <div className={'relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10'}>
                <AuthBackground login={login} />
                <div className={'relative w-full max-w-sm'}>
                    {logo}
                    {card(login.background !== 'none')}
                    {footer}
                </div>
            </div>
        );
    }

    if (login.layout === 'showcase') {
        return (
            <div className={'relative min-h-screen overflow-hidden'}>
                <AuthBackground login={login} />
                <div
                    className={classNames(
                        'relative flex min-h-screen flex-col lg:items-stretch',
                        login.side === 'left' ? 'lg:flex-row' : 'lg:flex-row-reverse'
                    )}
                >
                    <div
                        className={
                            'flex w-full items-center justify-center px-4 py-10 lg:w-[30rem] lg:flex-shrink-0 lg:px-10'
                        }
                    >
                        <div className={'w-full max-w-sm'}>
                            {logo}
                            {card(true)}
                            {footer}
                        </div>
                    </div>
                    <div className={'hidden flex-1 flex-col justify-end p-14 lg:flex'}>{message(true)}</div>
                </div>
            </div>
        );
    }

    // Brand and split: a side that says who you are, and the form.
    const plain = login.layout === 'split';

    return (
        <div
            className={classNames(
                'flex min-h-screen flex-col',
                login.side === 'left' ? 'lg:flex-row' : 'lg:flex-row-reverse'
            )}
        >
            <div
                className={classNames(
                    'flex w-full items-center justify-center px-4 py-10 lg:w-[34rem] lg:flex-shrink-0 lg:px-12',
                    plain ? 'bg-white' : 'bg-neutral-800'
                )}
            >
                <div className={'w-full max-w-sm'}>
                    {logo}
                    {plain ? <div>{heading}</div> : card(false)}
                    {footer}
                </div>
            </div>
            <div className={'relative hidden flex-1 flex-col justify-between overflow-hidden p-14 lg:flex'}>
                <AuthBackground login={login} />
                <div className={'relative flex items-center gap-3'}>
                    <PanelLogo className={'h-10 w-10 object-contain'} />
                    {name && <span className={'text-lg font-semibold tracking-tight text-neutral-50'}>{name}</span>}
                </div>
                <div className={'relative'}>{message(true)}</div>
                <p className={'relative text-xs text-neutral-300'}>
                    {name || 'Panel'} &copy; {year}
                </p>
            </div>
        </div>
    );
});

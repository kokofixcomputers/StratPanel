import React, { forwardRef } from 'react';
import { Form } from 'formik';
import { ArchiveIcon, CubeTransparentIcon, GlobeAltIcon, PuzzleIcon, TerminalIcon } from '@heroicons/react/outline';
import { useStoreState } from 'easy-peasy';
import FlashMessageRender from '@/components/FlashMessageRender';
import tw from 'twin.macro';

type Props = React.DetailedHTMLProps<React.FormHTMLAttributes<HTMLFormElement>, HTMLFormElement> & {
    title?: string;
    subtitle?: string;
};

const FEATURES = [
    { icon: PuzzleIcon, text: 'Install mods, plugins and modpacks in one click' },
    { icon: TerminalIcon, text: 'A live console with colours, search and tab completion' },
    { icon: GlobeAltIcon, text: 'Custom domains that just work' },
    { icon: ArchiveIcon, text: 'Backups, worlds and files in one place' },
];

const Logo = ({ className }: { className?: string }) => (
    <span
        className={`flex items-center justify-center rounded-2xl bg-primary-600 shadow-md ${className || 'h-12 w-12'}`}
    >
        <CubeTransparentIcon className={'h-2/3 w-2/3 text-white'} />
    </span>
);

export default forwardRef<HTMLFormElement, Props>(({ title, subtitle, ...props }, ref) => {
    const name = useStoreState((state) => state.settings.data?.name);

    return (
        <div className={'flex min-h-screen bg-white'}>
            <aside
                className={'relative hidden flex-1 flex-col justify-between overflow-hidden p-12 text-white lg:flex'}
                style={{
                    background:
                        'radial-gradient(circle at 15% 10%, rgba(255,255,255,0.18), transparent 38%), ' +
                        'radial-gradient(circle at 90% 85%, rgba(255,255,255,0.12), transparent 40%), ' +
                        'linear-gradient(135deg, #1447e6 0%, #1237b4 55%, #0d2a85 100%)',
                }}
            >
                <div
                    aria-hidden
                    className={'pointer-events-none absolute inset-0 opacity-20'}
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), ' +
                            'linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)',
                        backgroundSize: '48px 48px',
                        maskImage: 'linear-gradient(135deg, black, transparent 70%)',
                        WebkitMaskImage: 'linear-gradient(135deg, black, transparent 70%)',
                    }}
                />
                <div className={'relative flex items-center'}>
                    <span
                        className={
                            'flex h-11 w-11 items-center justify-center rounded-xl bg-white bg-opacity-20 backdrop-blur'
                        }
                    >
                        <CubeTransparentIcon className={'h-7 w-7'} />
                    </span>
                    <span className={'ml-3 text-xl font-semibold tracking-tight'}>{name || 'Panel'}</span>
                </div>
                <div className={'relative max-w-lg'}>
                    <h1 className={'text-4xl font-bold leading-tight tracking-tight'}>
                        Your Minecraft servers, without the hassle.
                    </h1>
                    <ul className={'mt-8 space-y-4 p-0'} style={{ listStyle: 'none' }}>
                        {FEATURES.map(({ icon: Icon, text }) => (
                            <li key={text} className={'flex items-center text-base text-white text-opacity-90'}>
                                <span
                                    className={
                                        'mr-3 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white bg-opacity-15'
                                    }
                                >
                                    <Icon className={'h-5 w-5'} />
                                </span>
                                {text}
                            </li>
                        ))}
                    </ul>
                </div>
                <p className={'relative text-sm text-white text-opacity-60'}>
                    Powered by Pterodactyl, the open source game server panel.
                </p>
            </aside>

            <main className={'flex w-full flex-col items-center justify-center px-6 py-10 lg:w-[34rem] lg:flex-none'}>
                <div className={'w-full max-w-sm'}>
                    <div className={'mb-8 flex flex-col items-center lg:hidden'}>
                        <Logo />
                        {name && <p className={'mt-3 text-sm font-medium text-neutral-300'}>{name}</p>}
                    </div>
                    {title && <h2 css={tw`text-3xl font-bold tracking-tight text-neutral-50`}>{title}</h2>}
                    {subtitle && <p css={tw`mt-2 mb-8 text-sm text-neutral-400`}>{subtitle}</p>}
                    {!subtitle && title && <div css={tw`mb-8`} />}
                    <FlashMessageRender css={tw`mb-4`} />
                    <Form {...props} ref={ref}>
                        {/* The form itself is a flex row for the other screens, keep everything in one column. */}
                        <div className={'w-full'}>{props.children}</div>
                    </Form>
                    <p css={tw`mt-10 text-center text-xs text-neutral-400`}>
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
            </main>
        </div>
    );
});

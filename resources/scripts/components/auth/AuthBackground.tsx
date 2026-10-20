import React, { useMemo } from 'react';
import { iconFor, SOFTWARE } from '@/lib/mcjars';
import { LoginOptions } from '@/lib/themeConfig';

const seeded = (seed: number) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Squares of the accent colour on a grid, some of them slowly lighting up and fading. The same squares every time. */
const Squares = () => {
    const squares = useMemo(() => {
        const random = seeded(20261020);
        const cell = 32;
        const out: { x: number; y: number; opacity: number; duration: number; delay: number; twinkle: boolean }[] = [];
        for (let y = 0; y < 20; y++)
            for (let x = 0; x < 30; x++) {
                if (random() > 0.32) continue;
                out.push({
                    x: x * cell,
                    y: y * cell,
                    opacity: 0.05 + random() * 0.22,
                    duration: 3 + random() * 5,
                    delay: random() * 6,
                    twinkle: random() > 0.55,
                });
            }

        return out;
    }, []);

    return (
        <svg
            aria-hidden
            className={'absolute inset-0 h-full w-full'}
            viewBox={'0 0 960 640'}
            preserveAspectRatio={'xMidYMid slice'}
        >
            {squares.map((s, i) => (
                <rect
                    key={i}
                    x={s.x + 3}
                    y={s.y + 3}
                    width={26}
                    height={26}
                    rx={4}
                    fill={'rgb(var(--c-primary-600))'}
                    opacity={s.opacity}
                    style={
                        s.twinkle
                            ? { animation: `login-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite` }
                            : undefined
                    }
                />
            ))}
        </svg>
    );
};

/** A grid with a band of light sweeping across it and a thin line moving down. */
const Scan = () => (
    <>
        <div
            aria-hidden
            className={'absolute inset-0'}
            style={{
                backgroundImage:
                    'linear-gradient(rgb(var(--c-neutral-500) / 0.45) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--c-neutral-500) / 0.45) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
            }}
        />
        <div
            aria-hidden
            className={'absolute inset-y-0 w-1/3'}
            style={{
                background:
                    'linear-gradient(90deg, transparent, rgb(var(--c-primary-600) / 0.16), rgb(var(--c-primary-400) / 0.34), rgb(var(--c-primary-600) / 0.16), transparent)',
                animation: 'login-scan 7s ease-in-out infinite',
            }}
        />
        <div
            aria-hidden
            className={'absolute inset-x-0 h-px'}
            style={{
                background: 'rgb(var(--c-primary-500) / 0.7)',
                boxShadow: '0 0 18px 2px rgb(var(--c-primary-500) / 0.5)',
                animation: 'login-scan-down 9s linear infinite',
            }}
        />
    </>
);

/** Rows of banners of the kinds of server there are, sliding past each other. */
const Eggs = () => (
    <div
        aria-hidden
        className={'absolute inset-0 flex flex-col justify-center gap-4 overflow-hidden'}
        style={{ transform: 'rotate(-6deg) scale(1.2)' }}
    >
        {[0, 1, 2, 3, 4, 5].map((row) => (
            <div
                key={row}
                className={'flex w-max gap-4'}
                style={{
                    animation: `login-marquee ${44 + row * 7}s linear infinite`,
                    animationDirection: row % 2 ? 'reverse' : 'normal',
                }}
            >
                {Array.from({ length: 32 }).map((_, i) => {
                    const shifted = SOFTWARE[(i + row * 3) % SOFTWARE.length];

                    return (
                        <div
                            key={i}
                            className={
                                'flex items-center gap-3 rounded-xl border border-neutral-500 bg-white/70 px-5 py-3 shadow'
                            }
                            style={{ opacity: 0.55 }}
                        >
                            <img
                                src={iconFor(shifted.type)}
                                alt={''}
                                className={'h-8 w-8 object-contain'}
                                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                            />
                            <span className={'whitespace-nowrap text-sm font-semibold text-neutral-100'}>
                                {shifted.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        ))}
    </div>
);

/** What is behind the sign in pages (see `login` in lib/themeConfig.ts), fills the box it is put in. */
export default ({ login }: { login: LoginOptions }) => {
    if (login.background === 'none') return null;

    return (
        <div aria-hidden className={'pointer-events-none absolute inset-0 overflow-hidden'}>
            {login.background === 'gradient' && (
                <div className={'absolute inset-0'} style={{ background: 'var(--login-gradient, none)' }} />
            )}
            {login.background === 'image' && (
                <div
                    className={'absolute inset-0'}
                    style={{
                        background: 'var(--login-image, none) center / cover no-repeat',
                        filter: 'blur(var(--login-blur, 0px))',
                        transform: 'scale(1.05)',
                    }}
                />
            )}
            {login.background === 'scan' && <Scan />}
            {login.background === 'squares' && <Squares />}
            {login.background === 'eggs' && <Eggs />}
            <div
                className={'absolute inset-0'}
                style={{ background: 'rgb(var(--c-neutral-800) / var(--login-dim, 0))' }}
            />
        </div>
    );
};

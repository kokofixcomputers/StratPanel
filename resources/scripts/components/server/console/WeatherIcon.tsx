import React from 'react';
import { Weather } from '@/lib/worldClock';
import styles from './style.module.css';

const SUN = '#F5B73A';
const MOON = '#A9B8E8';
const CLOUD = '#D5DCE8';
const CLOUD_DARK = '#8E9AB0';
const RAIN = '#4C8DF6';
const BOLT = '#FFC83D';

// The picture of the cloud is the same in every state, only its colour and place change.
const CLOUD_PATH = 'M7.5 19.5a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17.6 11a4.25 4.25 0 0 1-.1 8.5z';

const Sun = ({ cx, cy, r, rays }: { cx: number; cy: number; r: number; rays: number }) => (
    <g stroke={SUN} strokeWidth={1.6} strokeLinecap={'round'}>
        <circle cx={cx} cy={cy} r={r} fill={SUN} stroke={'none'} />
        {Array.from({ length: 8 }, (_, i) => {
            const angle = (i * Math.PI) / 4;

            return (
                <line
                    key={i}
                    x1={cx + Math.cos(angle) * (r + 2)}
                    y1={cy + Math.sin(angle) * (r + 2)}
                    x2={cx + Math.cos(angle) * (r + 2 + rays)}
                    y2={cy + Math.sin(angle) * (r + 2 + rays)}
                />
            );
        })}
    </g>
);

const Crescent = ({ x, y, size }: { x: number; y: number; size: number }) => (
    <g transform={`translate(${x} ${y}) scale(${size / 24})`}>
        <path d={'M20.5 14.2A9 9 0 0 1 9.8 3.5a9 9 0 1 0 10.7 10.7z'} fill={MOON} />
    </g>
);

const Drops = ({ xs, y }: { xs: number[]; y: number }) => (
    <g stroke={RAIN} strokeWidth={1.7} strokeLinecap={'round'}>
        {xs.map((x, i) => (
            <line
                key={x}
                className={styles.rain_drop}
                style={{ animationDelay: `${i * 0.22}s` }}
                x1={x}
                y1={y}
                x2={x - 0.9}
                y2={y + 2.6}
            />
        ))}
    </g>
);

const Cloud = ({ fill, stroke }: { fill: string; stroke: string }) => (
    <path d={CLOUD_PATH} fill={fill} stroke={stroke} strokeWidth={0.8} strokeLinejoin={'round'} />
);

/**
 * The weather as a small picture, like the ones of a weather app: the sun, the moon, a cloud with rain in front of the sun or
 * the moon, and a storm cloud with lightning. The rain moves a little unless the person asked for no motion.
 */
export default ({ weather, size = 22, title }: { weather: Weather; size?: number; title?: string }) => (
    <svg
        width={size}
        height={size}
        viewBox={'0 0 24 24'}
        role={'img'}
        aria-label={title}
        className={'flex-shrink-0'}
        xmlns={'http://www.w3.org/2000/svg'}
    >
        {title && <title>{title}</title>}
        {weather === 'clear-day' && <Sun cx={12} cy={12} r={4.6} rays={2.4} />}
        {weather === 'clear-night' && (
            <>
                <Crescent x={2.5} y={2.5} size={19} />
                <g fill={MOON}>
                    <circle cx={19} cy={5} r={0.9} />
                    <circle cx={16} cy={2.4} r={0.6} />
                </g>
            </>
        )}
        {weather === 'rain-day' && (
            <>
                <Sun cx={7.5} cy={7.5} r={3.1} rays={1.7} />
                <g transform={'translate(1.5 -2)'}>
                    <Cloud fill={CLOUD} stroke={CLOUD_DARK} />
                </g>
                <Drops xs={[8, 12, 16]} y={20.2} />
            </>
        )}
        {weather === 'rain-night' && (
            <>
                <Crescent x={0.5} y={-1.2} size={12.5} />
                <g transform={'translate(1.5 -2)'}>
                    <Cloud fill={CLOUD} stroke={CLOUD_DARK} />
                </g>
                <Drops xs={[8, 12, 16]} y={20.2} />
            </>
        )}
        {weather === 'thunder' && (
            <>
                <g transform={'translate(0 -3)'}>
                    <Cloud fill={CLOUD_DARK} stroke={'#6B778C'} />
                </g>
                <path
                    className={styles.bolt}
                    d={'M13.2 13.2 9.6 18.6h2.7l-1.2 4.4 4.3-6h-2.8l1.4-3.8z'}
                    fill={BOLT}
                    stroke={'#E0A21B'}
                    strokeWidth={0.5}
                    strokeLinejoin={'round'}
                />
                <Drops xs={[6.5, 17.5]} y={17.2} />
            </>
        )}
    </svg>
);

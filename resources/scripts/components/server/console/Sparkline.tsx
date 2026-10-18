import React, { useMemo, useState } from 'react';
import { agoLabel, indexAt } from '@/lib/statFormat';

interface Props {
    values: number[];
    max?: number;
    color?: string;
    width?: number;
    height?: number;
    // Shows the exact value of the point under the pointer. Without it the chart is only a picture.
    format?: (value: number) => string;
    // Seconds between two points, for "5 s ago".
    intervalSeconds?: number;
}

/**
 * A tiny dependency-free line chart used inside the stat cards. Falls back to a flat baseline
 * when there is no data (for example while the server is offline). With `format` it can be hovered: a marker follows
 * the pointer along the line and says what the value was at that moment.
 */
export default ({
    values,
    max,
    color = 'rgb(var(--c-primary-600))',
    width = 150,
    height = 44,
    format,
    intervalSeconds = 1,
}: Props) => {
    const [hover, setHover] = useState<number | null>(null);

    const { line, area, points } = useMemo(() => {
        const pad = 2;
        const ceiling = Math.max(max || 0, ...values, 1);
        const step = (width - pad * 2) / Math.max(values.length - 1, 1);
        const points = values.map(
            (value, index) =>
                [pad + index * step, height - pad - (Math.max(value, 0) / ceiling) * (height - pad * 2)] as const
        );

        if (points.length < 2) {
            const y = height - pad;
            return { line: `M${pad},${y} L${width - pad},${y}`, area: '', points };
        }

        const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

        return {
            line: path,
            area: `${path} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(
                1
            )},${height} Z`,
            points,
        };
    }, [values, max, width, height]);

    const active = format && hover !== null && points[hover] ? hover : null;
    const [px, py] = active !== null ? points[active] : [0, 0];
    // Near the edges the label would run out of the card, so it leans the other way.
    const left = (px / width) * 100;

    return (
        <div
            className={'relative w-24 xl:w-36'}
            onMouseMove={
                format
                    ? (e) => {
                          const box = e.currentTarget.getBoundingClientRect();
                          setHover(indexAt(e.clientX - box.left, box.width, values.length));
                      }
                    : undefined
            }
            onMouseLeave={format ? () => setHover(null) : undefined}
        >
            <svg viewBox={`0 0 ${width} ${height}`} className={'block w-full h-auto'} preserveAspectRatio={'none'}>
                {area && <path d={area} fill={color} opacity={0.08} />}
                <path
                    d={line}
                    fill={'none'}
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap={'round'}
                    strokeLinejoin={'round'}
                    vectorEffect={'non-scaling-stroke'}
                />
            </svg>
            {active !== null && format && (
                <>
                    <span
                        className={'pointer-events-none absolute h-2 w-2 rounded-full border-2 border-white'}
                        style={{
                            left: `${left}%`,
                            top: `${(py / height) * 100}%`,
                            background: color,
                            transform: 'translate(-50%, -50%)',
                        }}
                    />
                    <div
                        className={
                            'pointer-events-none absolute bottom-full z-50 mb-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-snow shadow-lg'
                        }
                        style={{
                            left: `${left}%`,
                            transform: `translateX(${left < 25 ? '-15%' : left > 75 ? '-85%' : '-50%'})`,
                        }}
                    >
                        <div>{format(values[active])}</div>
                        <div className={'font-normal text-slate-300'}>
                            {agoLabel(active, values.length, intervalSeconds)}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

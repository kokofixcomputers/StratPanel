import React, { useMemo } from 'react';

interface Props {
    values: number[];
    max?: number;
    color?: string;
    width?: number;
    height?: number;
}

/**
 * A tiny dependency-free line chart used inside the stat cards. Falls back to a flat baseline
 * when there is no data (for example while the server is offline).
 */
export default ({ values, max, color = '#1447e6', width = 150, height = 44 }: Props) => {
    const { line, area } = useMemo(() => {
        const pad = 2;
        const ceiling = Math.max(max || 0, ...values, 1);
        const step = (width - pad * 2) / Math.max(values.length - 1, 1);
        const points = values.map(
            (value, index) =>
                [pad + index * step, height - pad - (Math.max(value, 0) / ceiling) * (height - pad * 2)] as const
        );

        if (points.length < 2) {
            const y = height - pad;
            return { line: `M${pad},${y} L${width - pad},${y}`, area: '' };
        }

        const path = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

        return {
            line: path,
            area: `${path} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(
                1
            )},${height} Z`,
        };
    }, [values, max, width, height]);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className={'block w-24 xl:w-36 h-auto'} preserveAspectRatio={'none'}>
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
    );
};

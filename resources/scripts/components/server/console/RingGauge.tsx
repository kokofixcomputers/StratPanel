import React from 'react';

interface Props {
    percent: number;
    size?: number;
    color?: string;
}

export default ({ percent, size = 76, color = '#1447e6' }: Props) => {
    const stroke = 8;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const value = Math.min(Math.max(percent, 0), 100);

    return (
        <div className={'relative'} style={{ width: size, height: size }}>
            <svg width={size} height={size} className={'-rotate-90'}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill={'none'} stroke={'#e8eefc'} strokeWidth={stroke} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill={'none'}
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap={'round'}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - value / 100)}
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
            </svg>
            <span
                className={'absolute inset-0 flex items-center justify-center text-sm font-semibold text-primary-600'}
            >
                {Math.round(value)}%
            </span>
        </div>
    );
};

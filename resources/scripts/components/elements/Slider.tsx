import React from 'react';

interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    display: string;
    hint?: string;
    onChange: (value: number) => void;
}

/** A labelled range input styled to match the rest of the UI. */
export default ({ label, value, min, max, step, display, hint, onChange }: Props) => {
    const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
        <div>
            <div className={'flex items-baseline justify-between mb-2'}>
                <label className={'text-sm font-medium text-neutral-200'}>{label}</label>
                <span className={'text-sm font-semibold text-neutral-50'}>{display}</span>
            </div>
            <input
                type={'range'}
                min={min}
                max={max}
                step={step}
                value={value}
                aria-label={label}
                onChange={(e) => onChange(Number(e.currentTarget.value))}
                className={'w-full h-2 rounded-full appearance-none cursor-pointer outline-none'}
                style={{
                    background: `linear-gradient(to right, #1447e6 ${percent}%, #e5e7eb ${percent}%)`,
                    ...({ accentColor: '#1447e6' } as React.CSSProperties),
                }}
            />
            <div className={'flex justify-between mt-1 text-2xs text-neutral-400'}>
                <span />
                {hint && <span>{hint}</span>}
            </div>
        </div>
    );
};

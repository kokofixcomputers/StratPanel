import React, { useEffect, useState } from 'react';
import classNames from 'classnames';

/** Which section of the editor is open (the rail on the left chooses). */
export const SectionContext = React.createContext<string>('');

/** The content of one section, only drawn while the rail has it open. */
export const Group = ({ id, children }: { id: string; children: React.ReactNode }) => {
    const active = React.useContext(SectionContext);

    return active === id ? <div className={'space-y-4 px-5 pb-6 pt-1'}>{children}</div> : null;
};

export const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
        <p className={'mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400'}>{label}</p>
        {children}
    </div>
);

export function Segmented<T extends string | number>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div className={'flex flex-wrap gap-1.5'}>
            {options.map((option) => (
                <button
                    key={String(option.value)}
                    type={'button'}
                    onClick={() => onChange(option.value)}
                    className={classNames(
                        'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                        option.value === value
                            ? 'border-primary-600 bg-primary-50 font-medium text-primary-700'
                            : 'border-neutral-500 text-neutral-300 hover:bg-neutral-600'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export const ColorField = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);

    return (
        <div className={'flex items-center gap-2'}>
            <input
                type={'color'}
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                className={'h-9 w-12 cursor-pointer rounded-lg border border-neutral-500 bg-transparent p-0.5'}
                aria-label={'Pick a colour'}
            />
            <input
                type={'text'}
                value={text}
                maxLength={7}
                spellCheck={false}
                onChange={(e) => {
                    setText(e.currentTarget.value);
                    if (/^#[0-9a-fA-F]{6}$/.test(e.currentTarget.value)) onChange(e.currentTarget.value.toLowerCase());
                }}
                className={
                    'w-28 rounded-lg border border-neutral-500 bg-white px-3 py-1.5 font-mono text-sm text-neutral-100'
                }
            />
        </div>
    );
};

/** A colour that can be left at its default: shows the default until it is changed, and can be reset. */
export const OptionalColor = ({
    label,
    value,
    fallback,
    onChange,
}: {
    label: string;
    value: string | null;
    fallback: string;
    onChange: (value: string | null) => void;
}) => (
    <div className={'flex items-center justify-between gap-3'}>
        <span className={'text-sm text-neutral-200'}>{label}</span>
        <div className={'flex items-center gap-2'}>
            {value ? (
                <button type={'button'} className={'text-xs text-primary-600'} onClick={() => onChange(null)}>
                    Default
                </button>
            ) : (
                <span className={'text-xs text-neutral-400'}>Default</span>
            )}
            <input
                type={'color'}
                value={value ?? fallback}
                onChange={(e) => onChange(e.currentTarget.value.toLowerCase())}
                className={'h-8 w-10 cursor-pointer rounded-lg border border-neutral-500 bg-transparent p-0.5'}
                aria-label={label}
            />
        </div>
    </div>
);

export const Slider = ({
    value,
    min,
    max,
    unit,
    onChange,
}: {
    value: number;
    min: number;
    max: number;
    unit: string;
    onChange: (value: number) => void;
}) => (
    <div className={'flex items-center gap-3'}>
        <input
            type={'range'}
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Number(e.currentTarget.value))}
            className={'h-1.5 flex-1 cursor-pointer accent-primary-600'}
        />
        <span className={'w-14 text-right font-mono text-xs text-neutral-300'}>
            {value}
            {unit}
        </span>
    </div>
);

export const Toggle = ({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) => (
    <label className={'flex cursor-pointer items-center justify-between gap-3 text-sm text-neutral-200'}>
        {label}
        <input
            type={'checkbox'}
            checked={checked}
            onChange={(e) => onChange(e.currentTarget.checked)}
            className={'h-4 w-4 cursor-pointer accent-primary-600'}
        />
    </label>
);

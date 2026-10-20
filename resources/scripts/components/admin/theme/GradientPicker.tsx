import React from 'react';
import classNames from 'classnames';
import { Row, Segmented, Slider } from '@/components/admin/theme/controls';
import { CustomGradient, customGradientCss, GRADIENTS } from '@/lib/themeConfig';

const tile = (selected: boolean) =>
    classNames(
        'h-12 rounded-lg border-2 text-xs font-medium text-neutral-100',
        selected ? 'border-primary-600' : 'border-neutral-500'
    );

/** The gradients to choose from, and one of your own: an angle and 2 or 3 colours for the light theme and for the dark one. */
export default ({
    value,
    onChange,
    custom,
    onCustomChange,
    dark,
}: {
    // The id of a gradient, "custom" for the own one.
    value: string;
    onChange: (id: string) => void;
    custom: CustomGradient;
    onCustomChange: (gradient: CustomGradient) => void;
    // Which theme the tiles are drawn in.
    dark: boolean;
}) => {
    const mode = dark ? 'dark' : 'light';
    const stops = custom.light.length;

    const setStops = (count: number) => {
        const resize = (colors: string[]) =>
            count === colors.length
                ? colors
                : count === 2
                ? [colors[0], colors[colors.length - 1]]
                : [colors[0], colors[0], colors[1]];
        onCustomChange({ ...custom, light: resize(custom.light), dark: resize(custom.dark) });
    };
    const setColor = (theme: 'light' | 'dark', index: number, color: string) =>
        onCustomChange({ ...custom, [theme]: custom[theme].map((c, i) => (i === index ? color : c)) });

    return (
        <div className={'space-y-3'}>
            <div className={'grid grid-cols-3 gap-2'}>
                {Object.entries(GRADIENTS).map(([id, gradient]) => (
                    <button
                        key={id}
                        type={'button'}
                        onClick={() => onChange(id)}
                        className={tile(value === id)}
                        style={{ background: gradient[mode] }}
                    >
                        {gradient.label}
                    </button>
                ))}
                <button
                    type={'button'}
                    onClick={() => onChange('custom')}
                    className={tile(value === 'custom')}
                    style={{ background: customGradientCss(custom, mode) }}
                >
                    Your own
                </button>
            </div>
            {value === 'custom' && (
                <div className={'space-y-3 rounded-lg border border-neutral-500 p-3'}>
                    <Row label={'Angle'}>
                        <Slider
                            value={custom.angle}
                            min={0}
                            max={360}
                            unit={'°'}
                            onChange={(angle) => onCustomChange({ ...custom, angle })}
                        />
                    </Row>
                    <Row label={'Colours'}>
                        <Segmented
                            value={stops}
                            onChange={setStops}
                            options={[
                                { value: 2, label: '2 colours' },
                                { value: 3, label: '3 colours' },
                            ]}
                        />
                    </Row>
                    {(['light', 'dark'] as const).map((theme) => (
                        <div key={theme}>
                            <p className={'mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400'}>
                                {theme === 'light' ? 'Light theme' : 'Dark theme'}
                            </p>
                            <div className={'flex items-center gap-2'}>
                                {custom[theme].map((color, i) => (
                                    <input
                                        key={i}
                                        type={'color'}
                                        value={color}
                                        aria-label={`${theme} colour ${i + 1}`}
                                        onChange={(e) => setColor(theme, i, e.currentTarget.value)}
                                        className={
                                            'h-9 w-12 cursor-pointer rounded-lg border border-neutral-500 bg-transparent p-0.5'
                                        }
                                    />
                                ))}
                                <span
                                    className={'ml-1 h-9 flex-1 rounded-lg border border-neutral-500'}
                                    style={{ background: customGradientCss(custom, theme) }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlusIcon, SparklesIcon, XIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import '@/assets/fonts/monocraft.css';
import { PING_5, UNKNOWN_SERVER } from '@/lib/minecraftIcons';
import { CharFormat, COLORS, encodeMotdLines, FLAGS, MAX_LINES, MotdLine, parseMotdLines } from '@/lib/motd';
import { interpolateColors } from '@/lib/gradient';
import { GRADIENT_PRESETS, QUICK_PRESETS } from '@/lib/gradientPresets';

type Flag = typeof FLAGS[number];

const OBFUSCATION = 'abcdefghijklmnopqrstuvwxyz0123456789#%&?!';
const DEFAULT_COLOR = '#aaaaaa';
// Monocraft, a free pixel font that looks like the game's, see assets/fonts.
const FONT = '"Monocraft", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// The dark surfaces of the editor. The page around it is light, this is meant to look like the game.
const INK = { surface: '#161616', raised: '#202020', line: '#343434', text: '#e4e4e4', muted: '#8a8a8a' };

/** The shadow Minecraft draws under text is the colour at a quarter of its brightness. */
const shadowOf = (hex: string): string => {
    const n = parseInt(hex.replace('#', ''), 16);

    return `rgb(${((n >> 16) & 255) >> 2}, ${((n >> 8) & 255) >> 2}, ${(n & 255) >> 2})`;
};

const sameFormat = (a: CharFormat, b: CharFormat) =>
    a.color === b.color && FLAGS.every((flag) => !!a[flag] === !!b[flag]);

/** Runs of characters that share their formatting, which are what the preview draws as one piece. */
const runs = (
    line: MotdLine,
    selection: { s: number; e: number } | null = null
): { text: string; format: CharFormat; selected: boolean }[] => {
    const out: { text: string; format: CharFormat; selected: boolean }[] = [];
    for (let i = 0; i < line.text.length; i++) {
        const format = line.fmts[i] || {};
        const selected = !!selection && i >= selection.s && i < selection.e;
        const last = out[out.length - 1];
        if (last && last.selected === selected && sameFormat(last.format, format)) last.text += line.text[i];
        else out.push({ text: line.text[i], format, selected });
    }

    return out;
};

// ---- toolbar ---------------------------------------------------------------------------------------------------------

const Tool = ({
    children,
    title,
    onClick,
    disabled,
    active,
    style,
}: {
    children: React.ReactNode;
    title: string;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
    style?: React.CSSProperties;
}) => (
    <button
        type={'button'}
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        className={'h-7 min-w-[1.75rem] px-2 rounded-md text-xs font-medium select-none transition-colors duration-100'}
        style={{
            background: active ? 'rgba(96, 139, 250, 0.28)' : 'transparent',
            color: disabled ? '#4a4a4a' : active ? '#93b4fd' : INK.text,
            cursor: disabled ? 'not-allowed' : 'pointer',
            ...style,
        }}
    >
        {children}
    </button>
);

const Divider = () => <span className={'w-px h-5 mx-1 self-center'} style={{ background: INK.line }} />;

// ---- gradient presets ------------------------------------------------------------------------------------------------

const PresetBrowser = ({ onSelect, onClose }: { onSelect: (stops: string[]) => void; onClose: () => void }) => {
    const [query, setQuery] = useState('');
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const outside = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
        const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        document.addEventListener('mousedown', outside);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('mousedown', outside);
            document.removeEventListener('keydown', escape);
        };
    }, [onClose]);

    const shown = GRADIENT_PRESETS.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

    return createPortal(
        <div
            data-gradient-browser
            className={'fixed inset-0 flex items-center justify-center'}
            style={{ zIndex: 100000, background: 'rgba(0,0,0,0.55)' }}
        >
            <div
                ref={box}
                className={'rounded-2xl p-5 w-[520px] max-w-[95vw] max-h-[80vh] flex flex-col gap-4'}
                style={{
                    background: INK.surface,
                    border: `1px solid ${INK.line}`,
                    boxShadow: '0 24px 60px rgba(0,0,0,.5)',
                }}
            >
                <div className={'flex items-center justify-between'}>
                    <div className={'flex items-center gap-2'} style={{ color: INK.text }}>
                        <SparklesIcon className={'w-4 h-4'} style={{ color: '#93b4fd' }} />
                        <span className={'font-semibold text-sm'}>Gradient presets</span>
                        <span
                            className={'text-xs rounded-full px-2 py-0.5'}
                            style={{ background: INK.raised, color: INK.muted }}
                        >
                            {shown.length}
                        </span>
                    </div>
                    <button type={'button'} aria-label={'Close'} onClick={onClose} style={{ color: INK.muted }}>
                        <XIcon className={'w-4 h-4'} />
                    </button>
                </div>
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    placeholder={'Search presets…'}
                    className={'w-full rounded-lg px-3 py-2 text-sm outline-none'}
                    style={{ background: INK.raised, border: `1px solid ${INK.line}`, color: INK.text }}
                />
                <div className={'overflow-y-auto flex-1'}>
                    <div className={'grid grid-cols-2 sm:grid-cols-3 gap-2'}>
                        {shown.map((preset) => (
                            <button
                                key={preset.name}
                                type={'button'}
                                onClick={() => onSelect(preset.stops)}
                                className={
                                    'rounded-xl overflow-hidden text-left transition-transform duration-100 hover:scale-105'
                                }
                                style={{ border: `1px solid ${INK.line}` }}
                            >
                                <div
                                    className={'h-10'}
                                    style={{ background: `linear-gradient(90deg, ${preset.stops.join(',')})` }}
                                />
                                <div className={'px-2.5 py-1.5'} style={{ background: INK.raised }}>
                                    <span className={'text-xs font-medium'} style={{ color: INK.text }}>
                                        {preset.name}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                    {shown.length === 0 && (
                        <p className={'text-sm text-center py-8'} style={{ color: INK.muted }}>
                            No presets found
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

const GradientPopover = ({
    anchor,
    popover,
    stops,
    onStops,
    onApply,
    onPreset,
}: {
    anchor: React.RefObject<HTMLDivElement>;
    popover: React.RefObject<HTMLDivElement>;
    stops: string[];
    onStops: (stops: string[]) => void;
    onApply: () => void;
    onPreset: (stops: string[]) => void;
}) => {
    const [browse, setBrowse] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const rect = anchor.current?.getBoundingClientRect();
        if (rect)
            setPosition({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 256)) });
    }, []);

    const change = (index: number, hex: string) => onStops(stops.map((s, i) => (i === index ? hex : s)));

    return createPortal(
        <>
            <div
                ref={popover}
                className={'p-3 rounded-xl w-60 space-y-3'}
                style={{
                    position: 'fixed',
                    top: position.top,
                    left: position.left,
                    zIndex: 99999,
                    background: INK.surface,
                    border: `1px solid ${INK.line}`,
                    boxShadow: '0 12px 36px rgba(0,0,0,.45)',
                }}
                onMouseDown={(e) => e.preventDefault()}
            >
                <div>
                    <div className={'flex items-center justify-between mb-1.5'}>
                        <p className={'text-xs font-medium'} style={{ color: INK.muted }}>
                            Presets
                        </p>
                        <button
                            type={'button'}
                            onClick={() => setBrowse(true)}
                            className={'text-xs flex items-center gap-1 rounded-md px-1.5 py-0.5'}
                            style={{ color: '#93b4fd' }}
                        >
                            <SparklesIcon className={'w-3 h-3'} /> Browse all
                        </button>
                    </div>
                    <div className={'grid grid-cols-2 gap-1.5'}>
                        {QUICK_PRESETS.map((preset) => (
                            <button
                                key={preset.name}
                                type={'button'}
                                onClick={() => onPreset(preset.stops)}
                                className={
                                    'rounded-lg px-2 py-1 text-xs font-semibold text-left transition-transform duration-100 hover:scale-105'
                                }
                                style={{
                                    border: `1px solid ${INK.line}`,
                                    background: `linear-gradient(90deg, ${preset.stops.join(',')})`,
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                }}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ borderTop: `1px solid ${INK.line}`, paddingTop: '0.75rem' }}>
                    <div className={'flex items-center justify-between mb-1.5'}>
                        <p className={'text-xs font-medium'} style={{ color: INK.muted }}>
                            Colours
                        </p>
                        <button
                            type={'button'}
                            onClick={() => onStops([...stops, stops[stops.length - 1] || '#ffffff'])}
                            className={'text-xs flex items-center gap-0.5'}
                            style={{ color: '#93b4fd' }}
                        >
                            <PlusIcon className={'w-3 h-3'} /> Add
                        </button>
                    </div>
                    <div
                        className={'h-3 rounded-md mb-2'}
                        style={{
                            background: stops.length > 1 ? `linear-gradient(to right, ${stops.join(',')})` : stops[0],
                        }}
                    />
                    <div className={'space-y-1.5'}>
                        {stops.map((hex, i) => (
                            <div key={i} className={'flex items-center gap-2'}>
                                <span className={'text-xs w-3 text-center'} style={{ color: INK.muted }}>
                                    {i + 1}
                                </span>
                                <input
                                    type={'color'}
                                    value={hex}
                                    onChange={(e) => change(i, e.currentTarget.value)}
                                    className={
                                        'w-7 h-7 rounded cursor-pointer border-0 p-0 flex-shrink-0 bg-transparent'
                                    }
                                />
                                <input
                                    value={hex}
                                    maxLength={7}
                                    onChange={(e) =>
                                        /^#[0-9a-fA-F]{0,6}$/.test(e.currentTarget.value) &&
                                        change(i, e.currentTarget.value)
                                    }
                                    className={'flex-1 min-w-0 rounded-md px-2 py-0.5 text-xs font-mono outline-none'}
                                    style={{ background: INK.raised, border: `1px solid ${INK.line}`, color: INK.text }}
                                />
                                <button
                                    type={'button'}
                                    aria-label={'Remove colour'}
                                    disabled={stops.length <= 2}
                                    onClick={() => onStops(stops.filter((_, j) => j !== i))}
                                    className={'disabled:opacity-20'}
                                    style={{ color: INK.muted }}
                                >
                                    <XIcon className={'w-3 h-3'} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        type={'button'}
                        onClick={onApply}
                        className={'w-full text-xs py-1.5 rounded-lg font-medium mt-3'}
                        style={{ background: '#1447e6', color: '#fff' }}
                    >
                        Apply to selection
                    </button>
                </div>
            </div>
            {browse && (
                <PresetBrowser
                    onClose={() => setBrowse(false)}
                    onSelect={(preset) => {
                        setBrowse(false);
                        onPreset(preset);
                    }}
                />
            )}
        </>,
        document.body
    );
};

// ---- one editable line -----------------------------------------------------------------------------------------------

const LINE: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: 16,
    lineHeight: '20px',
    height: 20,
    padding: '0 2px',
    whiteSpace: 'pre',
    letterSpacing: 0,
};

const Overlay = ({
    line,
    tick,
    placeholder,
    selection,
}: {
    line: MotdLine;
    tick: number;
    placeholder: string;
    selection: { s: number; e: number } | null;
}) => (
    <div
        aria-hidden
        className={'select-none overflow-hidden'}
        style={{
            ...LINE,
            gridArea: '1 / 1',
            pointerEvents: 'none',
            zIndex: 1,
            textAlign: line.center ? 'center' : 'left',
        }}
    >
        {line.text ? (
            runs(line, selection).map((run, index) => {
                const color = run.format.color || DEFAULT_COLOR;

                return (
                    <span
                        key={index}
                        style={{
                            color,
                            fontWeight: run.format.bold ? 700 : 400,
                            fontStyle: run.format.italic ? 'italic' : 'normal',
                            textDecoration:
                                [run.format.underlined && 'underline', run.format.strikethrough && 'line-through']
                                    .filter(Boolean)
                                    .join(' ') || 'none',
                            textShadow: `2px 2px 0 ${shadowOf(color)}`,
                            // Drawn here and not by the browser, the input's own highlight is too faint on black and
                            // goes away when the colour picker takes the focus.
                            background: run.selected ? 'rgba(96, 139, 250, 0.7)' : 'none',
                            boxShadow: run.selected ? '0 0 0 1px rgba(147, 180, 253, 0.9)' : 'none',
                        }}
                    >
                        {run.format.obfuscated
                            ? run.text
                                  .split('')
                                  .map((c, i) =>
                                      c === ' '
                                          ? ' '
                                          : OBFUSCATION[(c.charCodeAt(0) + tick * 7 + i * 13) % OBFUSCATION.length]
                                  )
                                  .join('')
                            : run.text}
                    </span>
                );
            })
        ) : (
            <span style={{ color: '#4a4a4a' }}>{placeholder}</span>
        )}
    </div>
);

// ---- the builder -----------------------------------------------------------------------------------------------------

interface Props {
    value: string;
    onChange: (encoded: string) => void;
    // The server icon shown in the preview, null for the placeholder.
    icon?: string | null;
    onPickIcon?: (file: File) => void;
    onRemoveIcon?: () => void;
    maxPlayers?: number;
    // Buttons for the top right of the card, the properties page puts Save and Save & Restart here.
    actions?: React.ReactNode;
}

interface Selection {
    line: number;
    s: number;
    e: number;
}

/**
 * Builds the message of the day. The two lines are edited right where they show up in the multiplayer server list,
 * with a toolbar for colours, formats and gradients that works on the selected text.
 */
export default ({ value, onChange, icon = null, onPickIcon, onRemoveIcon, maxPlayers = 20, actions }: Props) => {
    const serverName = ServerContext.useStoreState((state) => state.server.data?.name || 'A Minecraft Server');
    const picker = useRef<HTMLInputElement>(null);
    const inputs = useRef<(HTMLInputElement | null)[]>([null, null]);
    const before = useRef([
        { s: 0, e: 0 },
        { s: 0, e: 0 },
    ]);
    const lastEmitted = useRef(value);

    const [lines, setLines] = useState<MotdLine[]>(() => parseMotdLines(value));
    const [sel, setSel] = useState<Selection | null>(null);
    const [focused, setFocused] = useState<number | null>(null);
    // The line the toolbar's centre button works on: the one being edited, or else the one edited last.
    const [current, setCurrent] = useState(0);
    const [tick, setTick] = useState(0);
    const [stops, setStops] = useState(['#ff0000', '#0000ff']);
    const [gradient, setGradient] = useState(false);
    const anchor = useRef<HTMLDivElement>(null);
    const popover = useRef<HTMLDivElement>(null);

    // Only follow outside changes (a reload, for example), not the value that was just sent out from here.
    useEffect(() => {
        if (value === lastEmitted.current) return;
        lastEmitted.current = value;
        setLines(parseMotdLines(value));
        setSel(null);
    }, [value]);

    const commit = useCallback(
        (next: MotdLine[]) => {
            setLines(next);
            const encoded = encodeMotdLines(next);
            lastEmitted.current = encoded;
            onChange(encoded);
        },
        [onChange]
    );

    const animated = lines.some((line) => line.fmts.some((f) => f && f.obfuscated));
    useEffect(() => {
        if (!animated) return;
        const timer = setInterval(() => setTick((t) => t + 1), 90);

        return () => clearInterval(timer);
    }, [animated]);

    // The highlight follows the selection while it is being made. React only reports a selection once the mouse is let go,
    // so a drag is followed by hand, and the browser's own event covers the keyboard (shift and the arrow keys).
    useEffect(() => {
        const remove: (() => void)[] = [];
        inputs.current.forEach((el, index) => {
            if (!el) return;
            const read = () => {
                if (document.activeElement !== el) return;
                const start = el.selectionStart ?? 0;
                const end = el.selectionEnd ?? 0;
                setSel((previous) =>
                    start >= end
                        ? previous && previous.line === index
                            ? null
                            : previous
                        : previous && previous.line === index && previous.s === start && previous.e === end
                        ? previous
                        : { line: index, s: start, e: end }
                );
            };
            let frame = 0;
            const move = () => {
                cancelAnimationFrame(frame);
                frame = requestAnimationFrame(read);
            };
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                read();
            };
            const down = () => {
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
            };
            el.addEventListener('mousedown', down);
            el.addEventListener('selectionchange', read);
            remove.push(() => {
                cancelAnimationFrame(frame);
                el.removeEventListener('mousedown', down);
                el.removeEventListener('selectionchange', read);
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            });
        });

        return () => remove.forEach((fn) => fn());
    }, []);

    // The selection before a character goes in is needed to know which formatting a typed character inherits.
    useEffect(() => {
        const remove: (() => void)[] = [];
        inputs.current.forEach((el, index) => {
            if (!el) return;
            const listener = () => (before.current[index] = { s: el.selectionStart ?? 0, e: el.selectionEnd ?? 0 });
            el.addEventListener('beforeinput', listener);
            remove.push(() => el.removeEventListener('beforeinput', listener));
        });

        return () => remove.forEach((fn) => fn());
    }, []);

    useEffect(() => {
        if (!gradient) return;
        const outside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                anchor.current?.contains(target) ||
                popover.current?.contains(target) ||
                (target as Element).closest?.('[data-gradient-browser]')
            )
                return;
            setGradient(false);
        };
        document.addEventListener('mousedown', outside);

        return () => document.removeEventListener('mousedown', outside);
    }, [gradient]);

    const report = (index: number) => {
        const el = inputs.current[index];
        if (!el) return;
        const s = el.selectionStart ?? 0;
        const e = el.selectionEnd ?? 0;
        setSel((previous) =>
            s >= e
                ? null
                : previous && previous.line === index && previous.s === s && previous.e === e
                ? previous
                : { line: index, s, e }
        );
    };

    const typed = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.currentTarget.value;
        const line = lines[index];
        const { s, e: end } = before.current[index];
        const inserted = Math.max(0, next.length - line.text.length + (end - s));
        const inherit = line.fmts[s > 0 ? s - 1 : 0] || {};

        const fmts = [
            ...line.fmts.slice(0, s),
            ...Array.from({ length: inserted }, () => ({ ...inherit })),
            ...line.fmts.slice(end),
        ].slice(0, next.length);
        while (fmts.length < next.length) fmts.push({ ...inherit });

        commit(lines.map((l, i) => (i === index ? { ...l, text: next, fmts } : l)));
    };

    const patch = (change: (format: CharFormat) => CharFormat) => {
        if (!sel) return;
        commit(
            lines.map((line, i) =>
                i === sel.line
                    ? { ...line, fmts: line.fmts.map((f, j) => (j >= sel.s && j < sel.e ? change(f || {}) : f)) }
                    : line
            )
        );
    };

    const selected = sel ? lines[sel.line].fmts.slice(sel.s, sel.e) : [];
    const all = (flag: Flag) => selected.length > 0 && selected.every((f) => !!f[flag]);
    const toggle = (flag: Flag) => patch((f) => ({ ...f, [flag]: all(flag) ? undefined : true }));
    const colorOfSelection = (selected[0] && selected[0].color) || DEFAULT_COLOR;

    const applyStops = (colors: string[]) => {
        if (!sel) return;
        const spread = interpolateColors(colors, sel.e - sel.s);
        commit(
            lines.map((line, i) =>
                i === sel.line
                    ? {
                          ...line,
                          fmts: line.fmts.map((f, j) =>
                              j >= sel.s && j < sel.e ? { ...f, color: spread[j - sel.s] } : f
                          ),
                      }
                    : line
            )
        );
        setGradient(false);
    };

    const openGradient = () => {
        if (!sel) return;
        // Start from the colours the selection has, so a gradient made earlier can be tweaked.
        const colours = selected.map((f) => f && f.color).filter(Boolean) as string[];
        const distinct = colours.filter((c, i) => i === 0 || c !== colours[i - 1]);
        if (distinct.length >= 2) {
            const step = (distinct.length - 1) / Math.min(distinct.length - 1, 4);
            setStops(
                distinct.length === 2
                    ? distinct
                    : Array.from({ length: Math.min(distinct.length, 5) }, (_, k) => distinct[Math.round(k * step)])
            );
        }
        setGradient((open) => !open);
    };

    const keys = (index: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
        const el = e.currentTarget;
        const go = (to: number, at: 'start' | 'end') => {
            const target = inputs.current[to];
            if (!target) return;
            e.preventDefault();
            target.focus();
            const position = at === 'start' ? 0 : target.value.length;
            target.setSelectionRange(position, position);
        };

        if (e.key === 'Enter' || e.key === 'ArrowDown') go(Math.min(index + 1, MAX_LINES - 1), 'start');
        else if (e.key === 'ArrowUp') go(Math.max(index - 1, 0), 'start');
        else if (e.key === 'Backspace' && index > 0 && el.selectionStart === 0 && el.selectionEnd === 0) {
            go(index - 1, 'end');
        }
    };

    const setCentered = (which: number[], center: boolean) =>
        commit(lines.map((line, i) => (which.includes(i) ? { ...line, center } : line)));

    const colorList = useMemo(() => Object.keys(COLORS), []);
    const hasSel = sel !== null;

    return (
        <div className={'bg-white border border-neutral-500 rounded-xl shadow-md mb-4'}>
            <div className={'px-5 py-4 border-b border-neutral-500 flex flex-wrap items-center justify-between gap-3'}>
                <div className={'min-w-0'}>
                    <h2 className={'text-base font-semibold text-neutral-50'}>MOTD Builder</h2>
                    <p className={'text-sm text-neutral-400 mt-0.5'}>
                        The message shown in the multiplayer server list. Type straight into the preview, select text
                        and pick a colour, a format or a gradient.
                    </p>
                </div>
                {actions && <div className={'flex flex-wrap items-center gap-2'}>{actions}</div>}
            </div>
            <div className={'p-5'}>
                <div className={'rounded-xl p-3'} style={{ background: INK.surface, border: `1px solid ${INK.line}` }}>
                    {/* Toolbar. Mouse down is stopped so the text keeps its focus and its selection. */}
                    <div className={'flex flex-wrap items-center gap-0.5 mb-3'} onMouseDown={(e) => e.preventDefault()}>
                        <Tool
                            title={'Bold'}
                            disabled={!hasSel}
                            active={all('bold')}
                            onClick={() => toggle('bold')}
                            style={{ fontWeight: 700 }}
                        >
                            B
                        </Tool>
                        <Tool
                            title={'Italic'}
                            disabled={!hasSel}
                            active={all('italic')}
                            onClick={() => toggle('italic')}
                            style={{ fontStyle: 'italic' }}
                        >
                            I
                        </Tool>
                        <Tool
                            title={'Underline'}
                            disabled={!hasSel}
                            active={all('underlined')}
                            onClick={() => toggle('underlined')}
                            style={{ textDecoration: 'underline' }}
                        >
                            U
                        </Tool>
                        <Tool
                            title={'Strikethrough'}
                            disabled={!hasSel}
                            active={all('strikethrough')}
                            onClick={() => toggle('strikethrough')}
                            style={{ textDecoration: 'line-through' }}
                        >
                            S
                        </Tool>
                        <Tool
                            title={'Obfuscated (scrambling text)'}
                            disabled={!hasSel}
                            active={all('obfuscated')}
                            onClick={() => toggle('obfuscated')}
                        >
                            Obf
                        </Tool>
                        <Divider />
                        <div
                            className={'flex flex-wrap gap-1'}
                            style={{ opacity: hasSel ? 1 : 0.35, pointerEvents: hasSel ? 'auto' : 'none' }}
                        >
                            {colorList.map((code) => (
                                <button
                                    key={code}
                                    type={'button'}
                                    title={COLORS[code].name}
                                    aria-label={COLORS[code].name}
                                    onClick={() => patch((f) => ({ ...f, color: COLORS[code].hex.toLowerCase() }))}
                                    className={'w-5 h-5 rounded-sm hover:scale-125 transition-transform duration-100'}
                                    style={{ background: COLORS[code].hex, border: '1px solid rgba(255,255,255,0.2)' }}
                                />
                            ))}
                        </div>
                        <label
                            title={'Custom colour'}
                            className={
                                'relative h-7 w-7 ml-1 rounded-md overflow-hidden cursor-pointer flex items-center justify-center'
                            }
                            style={{ opacity: hasSel ? 1 : 0.35, pointerEvents: hasSel ? 'auto' : 'none' }}
                        >
                            <span
                                className={'w-4 h-4 rounded-sm'}
                                style={{ background: colorOfSelection, border: '1px solid rgba(255,255,255,0.3)' }}
                            />
                            <input
                                type={'color'}
                                aria-label={'Custom colour'}
                                value={colorOfSelection}
                                onChange={(e) => {
                                    patch((f) => ({ ...f, color: e.currentTarget.value }));
                                }}
                                className={'absolute inset-0 opacity-0 cursor-pointer w-full h-full'}
                            />
                        </label>
                        <Divider />
                        <div ref={anchor} className={'relative'}>
                            <Tool title={'Gradient'} disabled={!hasSel} active={gradient} onClick={openGradient}>
                                Gradient
                            </Tool>
                            {gradient && (
                                <GradientPopover
                                    anchor={anchor}
                                    popover={popover}
                                    stops={stops}
                                    onStops={setStops}
                                    onApply={() => applyStops(stops)}
                                    onPreset={(preset) => {
                                        setStops(preset);
                                        applyStops(preset);
                                    }}
                                />
                            )}
                        </div>
                        <Divider />
                        <Tool
                            title={'Centre this line. Minecraft has no alignment, so spaces are put in front of it.'}
                            active={!!lines[current].center}
                            onClick={() => setCentered([current], !lines[current].center)}
                        >
                            Center
                        </Tool>
                        <Tool
                            title={'Centre both lines'}
                            active={lines.every((line) => line.center)}
                            onClick={() => setCentered([0, 1], !lines.every((line) => line.center))}
                        >
                            Center both
                        </Tool>
                        <Divider />
                        <Tool
                            title={'Clear formatting of the selection'}
                            disabled={!hasSel}
                            onClick={() => patch(() => ({}))}
                        >
                            Clear
                        </Tool>
                    </div>

                    <style>{'.motd-input::selection { background: transparent; }'}</style>
                    {/* The server list entry */}
                    <div
                        className={'flex items-start rounded-sm p-1'}
                        style={{
                            background: '#000',
                            border: `2px solid ${focused !== null ? '#ffffff' : '#555555'}`,
                            fontFamily: FONT,
                        }}
                        aria-label={'MOTD preview'}
                    >
                        <button
                            type={'button'}
                            title={onPickIcon ? 'Click to upload a server icon' : undefined}
                            aria-label={'Change server icon'}
                            disabled={!onPickIcon}
                            onClick={() => picker.current?.click()}
                            className={'group relative flex-shrink-0 overflow-hidden p-0 border-0 mr-3'}
                            style={{
                                width: 64,
                                height: 64,
                                background: 'none',
                                cursor: onPickIcon ? 'pointer' : 'default',
                            }}
                        >
                            <img
                                src={icon || UNKNOWN_SERVER}
                                alt={'Server icon'}
                                width={64}
                                height={64}
                                style={{ imageRendering: 'pixelated', width: 64, height: 64 }}
                            />
                            {onPickIcon && (
                                <span
                                    className={
                                        'absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-150'
                                    }
                                >
                                    Change
                                </span>
                            )}
                        </button>
                        <input
                            ref={picker}
                            type={'file'}
                            accept={'image/*'}
                            className={'hidden'}
                            onChange={(e) => {
                                const file = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (file && onPickIcon) onPickIcon(file);
                            }}
                        />
                        <div className={'min-w-0 flex-1 overflow-hidden'}>
                            <div
                                className={'flex items-center justify-between'}
                                style={{ ...LINE, whiteSpace: 'nowrap' }}
                            >
                                <span className={'truncate'} style={{ color: '#fff', textShadow: '2px 2px 0 #3f3f3f' }}>
                                    {serverName}
                                </span>
                                <span className={'flex items-center flex-shrink-0 ml-3'}>
                                    <span style={{ color: '#aaaaaa', textShadow: '2px 2px 0 #2a2a2a' }}>
                                        0<span style={{ color: '#555555' }}>/</span>
                                        {maxPlayers}
                                    </span>
                                    <img
                                        src={PING_5}
                                        alt={'Connection strength'}
                                        width={20}
                                        height={16}
                                        className={'ml-2'}
                                        style={{ imageRendering: 'pixelated' }}
                                    />
                                </span>
                            </div>
                            {lines.map((line, index) => (
                                <div
                                    key={index}
                                    style={{
                                        display: 'grid',
                                        outline: focused === index ? '1px dashed rgba(255,255,255,0.35)' : 'none',
                                        outlineOffset: 1,
                                    }}
                                >
                                    <Overlay
                                        line={line}
                                        tick={tick}
                                        placeholder={`Line ${index + 1}`}
                                        selection={sel && sel.line === index ? sel : null}
                                    />
                                    <input
                                        ref={(el) => {
                                            inputs.current[index] = el;
                                        }}
                                        value={line.text}
                                        spellCheck={false}
                                        autoComplete={'off'}
                                        aria-label={`MOTD line ${index + 1}`}
                                        onChange={(e) => typed(index, e)}
                                        onSelect={() => report(index)}
                                        onMouseUp={() => report(index)}
                                        onKeyUp={() => report(index)}
                                        onKeyDown={keys(index)}
                                        onFocus={() => {
                                            setFocused(index);
                                            setCurrent(index);
                                        }}
                                        onBlur={() => setFocused((current) => (current === index ? null : current))}
                                        className={'motd-input border-0 outline-none w-full'}
                                        style={{
                                            ...LINE,
                                            gridArea: '1 / 1',
                                            background: 'transparent',
                                            color: 'transparent',
                                            caretColor: '#ffffff',
                                            textAlign: line.center ? 'center' : 'left',
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className={'mt-2 text-xs'} style={{ color: INK.muted }}>
                        {hasSel
                            ? 'Pick a colour, a format or a gradient for the selected text.'
                            : 'Select some text to colour or format it. Two lines at most, and the game cuts off what does not fit.'}
                    </p>
                </div>

                {onPickIcon && (
                    <p className={'text-xs text-neutral-400 mt-3'}>
                        Click the icon in the preview to upload a server icon. Any image works, it is cropped to a
                        square and saved as a 64x64 PNG when you save. Restart the server to see it in the server list.
                        {icon && onRemoveIcon && (
                            <button
                                type={'button'}
                                onClick={onRemoveIcon}
                                className={'ml-2 text-red-600 hover:underline'}
                            >
                                Remove icon
                            </button>
                        )}
                    </p>
                )}
            </div>
        </div>
    );
};

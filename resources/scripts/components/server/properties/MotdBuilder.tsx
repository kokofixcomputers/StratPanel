import React, { useEffect, useRef, useState } from 'react';
import tw from 'twin.macro';
import { Textarea } from '@/components/elements/Input';
import { COLORS, decodeMotd, encodeMotd, MotdSegment, parseMotd } from '@/lib/motd';

const OBFUSCATION = 'abcdefghijklmnopqrstuvwxyz0123456789#%&?!';

const Segment = ({ segment, tick }: { segment: MotdSegment; tick: number }) => (
    <span
        style={{
            color: segment.color || '#AAAAAA',
            fontWeight: segment.bold ? 700 : 400,
            fontStyle: segment.italic ? 'italic' : 'normal',
            textDecoration:
                [segment.underline && 'underline', segment.strike && 'line-through'].filter(Boolean).join(' ') ||
                'none',
            textShadow: '2px 2px 0 rgba(0, 0, 0, 0.45)',
            whiteSpace: 'pre',
        }}
    >
        {segment.obfuscated
            ? segment.text
                  .split('')
                  .map((c, i) =>
                      c === ' ' ? ' ' : OBFUSCATION[(c.charCodeAt(0) + tick * 7 + i * 13) % OBFUSCATION.length]
                  )
                  .join('')
            : segment.text}
    </span>
);

const FORMATS: { code: string; label: string; title: string; style: React.CSSProperties }[] = [
    { code: '&l', label: 'B', title: 'Bold', style: { fontWeight: 700 } },
    { code: '&o', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
    { code: '&n', label: 'U', title: 'Underline', style: { textDecoration: 'underline' } },
    { code: '&m', label: 'S', title: 'Strikethrough', style: { textDecoration: 'line-through' } },
    { code: '&k', label: '?', title: 'Obfuscated (scrambling text)', style: {} },
];

/**
 * Builds the message of the day with colour and formatting buttons and a live preview that looks like the
 * multiplayer server list.
 */
export default ({ value, onChange }: { value: string; onChange: (encoded: string) => void }) => {
    const [text, setText] = useState(() => decodeMotd(value));
    const [tick, setTick] = useState(0);
    const [hex, setHex] = useState('#ff8800');
    const area = useRef<HTMLTextAreaElement>(null);
    const lines = parseMotd(text);

    // Only follow outside changes (for example a reload), not the value we just sent out ourselves.
    useEffect(() => {
        if (encodeMotd(text) !== value) setText(decodeMotd(value));
    }, [value]);

    useEffect(() => {
        if (!text.includes('&k')) return;

        const timer = setInterval(() => setTick((t) => t + 1), 90);

        return () => clearInterval(timer);
    }, [text.includes('&k')]);

    const update = (next: string) => {
        const limited = next.split('\n').slice(0, 2).join('\n');
        setText(limited);
        onChange(encodeMotd(limited));
    };

    /** Inserts a code at the cursor, or around the selection, which is reset again afterwards. */
    const insert = (code: string) => {
        const el = area.current;
        if (!el) return update(text + code);

        const { selectionStart: start, selectionEnd: end } = el;
        const selected = text.slice(start, end);
        const insertion = selected ? `${code}${selected}&r` : code;

        update(text.slice(0, start) + insertion + text.slice(end));
        setTimeout(() => {
            el.focus();
            const cursor = selected ? start + insertion.length : start + code.length;
            el.setSelectionRange(cursor, cursor);
        }, 0);
    };

    return (
        <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md mb-4`}>
            <div css={tw`px-5 py-4 border-b border-neutral-500`}>
                <h2 css={tw`text-base font-semibold text-neutral-50`}>MOTD Builder</h2>
                <p css={tw`text-sm text-neutral-400 mt-0.5`}>
                    The message shown in the multiplayer server list. Select text and pick a colour or format, or just
                    place the cursor and keep typing.
                </p>
            </div>
            <div css={tw`p-5`}>
                <div
                    css={tw`flex items-center rounded-lg px-3 py-3 mb-4`}
                    style={{ background: '#1c1c1c', border: '2px solid #3b3b3b' }}
                    aria-label={'MOTD preview'}
                >
                    <div
                        css={tw`flex-shrink-0 rounded mr-3`}
                        style={{
                            width: 56,
                            height: 56,
                            background: 'linear-gradient(135deg, #5b8a3a 0 50%, #7a5a3a 50% 100%)',
                        }}
                    />
                    <div
                        css={tw`min-w-0 overflow-hidden`}
                        style={{
                            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                            fontSize: 15,
                            lineHeight: '22px',
                        }}
                    >
                        {[0, 1].map((i) => (
                            <div key={i} style={{ minHeight: 22 }}>
                                {(lines[i] || []).map((segment, index) => (
                                    <Segment key={index} segment={segment} tick={tick} />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                <div css={tw`flex flex-wrap items-center gap-1.5 mb-3`}>
                    {Object.keys(COLORS).map((code) => (
                        <button
                            key={code}
                            type={'button'}
                            title={`${COLORS[code].name} (&${code})`}
                            aria-label={COLORS[code].name}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => insert(`&${code}`)}
                            css={tw`w-7 h-7 rounded-md border border-neutral-500 hover:scale-110 transition-transform duration-100`}
                            style={{ background: COLORS[code].hex }}
                        />
                    ))}
                    <span css={tw`w-px h-6 bg-neutral-500 mx-1`} />
                    <input
                        type={'color'}
                        value={hex}
                        aria-label={'Custom colour'}
                        title={'Custom colour'}
                        onChange={(e) => setHex(e.currentTarget.value)}
                        css={tw`w-7 h-7 rounded-md border border-neutral-500 bg-white cursor-pointer p-0.5`}
                    />
                    <button
                        type={'button'}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insert(`&${hex}`)}
                        css={tw`px-2.5 h-7 rounded-md border border-neutral-500 text-xs font-medium text-neutral-200 hover:bg-neutral-600`}
                    >
                        Use {hex.toUpperCase()}
                    </button>
                    <span css={tw`w-px h-6 bg-neutral-500 mx-1`} />
                    {FORMATS.map((format) => (
                        <button
                            key={format.code}
                            type={'button'}
                            title={`${format.title} (${format.code})`}
                            aria-label={format.title}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => insert(format.code)}
                            css={tw`w-7 h-7 rounded-md border border-neutral-500 text-sm text-neutral-100 hover:bg-neutral-600`}
                            style={format.style}
                        >
                            {format.label}
                        </button>
                    ))}
                    <button
                        type={'button'}
                        title={'Reset colour and formatting (&r)'}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insert('&r')}
                        css={tw`px-2.5 h-7 rounded-md border border-neutral-500 text-xs font-medium text-neutral-200 hover:bg-neutral-600`}
                    >
                        Reset
                    </button>
                </div>

                <Textarea
                    ref={area}
                    rows={2}
                    value={text}
                    spellCheck={false}
                    aria-label={'MOTD text'}
                    css={tw`font-mono`}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(e.currentTarget.value)}
                />
                <p css={tw`mt-2 text-xs text-neutral-400`}>
                    Two lines at most. Codes are written with &amp; here, like <code>&amp;a</code> for green or{' '}
                    <code>&amp;#ff8800</code> for a custom colour, and saved in the format Minecraft expects.
                </p>
            </div>
        </div>
    );
};

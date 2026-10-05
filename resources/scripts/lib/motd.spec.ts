import { centerPadding, decodeMotd, encodeMotd, encodeMotdLines, lineWidth, parseMotd, parseMotdLines } from './motd';

describe('motd', () => {
    it('round trips colour codes through the properties format', () => {
        const text = '&aGreen &lBold\n&#ff8800Orange';
        const encoded = encodeMotd(text);

        expect(encoded).toBe(
            '\\u00A7aGreen \\u00A7lBold\\n\\u00A7x\\u00A7f\\u00A7f\\u00A78\\u00A78\\u00A70\\u00A70Orange'
        );
        expect(decodeMotd(encoded)).toBe(text);
    });

    it('reads values written with literal section signs', () => {
        expect(decodeMotd('§6Gold')).toBe('&6Gold');
    });

    it('keeps at most two lines', () => {
        expect(encodeMotd('a\nb\nc')).toBe('a\\nb');
    });

    it('parses styles for the preview', () => {
        const [line] = parseMotd('&c&lHi &rthere');

        expect(line[0]).toMatchObject({ text: 'Hi ', color: '#FF5555', bold: true });
        expect(line[1]).toMatchObject({ text: 'there', color: null, bold: false });
    });
});

describe('formatted lines', () => {
    it('reads colours, hex colours and formats per character', () => {
        const [first, second] = parseMotdLines(
            '\\u00A7aGreen \\u00A7lBold\\n\\u00A7x\\u00A7f\\u00A7f\\u00A78\\u00A78\\u00A70\\u00A70Orange'
        );

        expect(first.text).toBe('Green Bold');
        expect(first.fmts[0]).toEqual({ color: '#55ff55' });
        // A format keeps the colour that came before it.
        expect(first.fmts[6]).toEqual({ color: '#55ff55', bold: true });
        expect(second.text).toBe('Orange');
        expect(second.fmts[0]).toEqual({ color: '#ff8800' });
    });

    it('keeps an escaped backslash in front of an n as text', () => {
        expect(parseMotdLines('a\\\\nb')[0].text).toBe('a\\nb');
        expect(parseMotdLines('a\\nb')[1].text).toBe('b');
    });

    it('writes the colour before the formats and resets between styles', () => {
        const line = { text: 'ab', fmts: [{ color: '#ff8800', bold: true }, {}] };

        expect(encodeMotdLines([line, { text: '', fmts: [] }])).toBe(
            '\\u00A7x\\u00A7f\\u00A7f\\u00A78\\u00A78\\u00A70\\u00A70\\u00A7la\\u00A7rb'
        );
        expect(encodeMotdLines([{ text: 'x', fmts: [{ color: '#55ff55' }] }])).toBe('\\u00A7ax');
    });

    it('round trips what the editor makes, two lines included', () => {
        const lines = [
            {
                text: 'Hi there',
                fmts: Array.from({ length: 8 }, (_, i) => (i < 2 ? { color: '#123456', italic: true } : {})),
            },
            { text: 'Second', fmts: Array.from({ length: 6 }, () => ({ underlined: true, obfuscated: true })) },
        ];
        const back = parseMotdLines(encodeMotdLines(lines));

        expect(back.map((l) => l.text)).toEqual(['Hi there', 'Second']);
        expect(back[0].fmts[0]).toEqual({ color: '#123456', italic: true });
        expect(back[0].fmts[5]).toEqual({});
        expect(back[1].fmts[3]).toEqual({ underlined: true, obfuscated: true });
    });

    it('does not turn a typed ampersand into a code', () => {
        const lines = [
            { text: 'Q&A &a', fmts: Array.from({ length: 6 }, () => ({})) },
            { text: '', fmts: [] },
        ];

        expect(parseMotdLines(encodeMotdLines(lines))[0].text).toBe('Q&A &a');
    });
});

describe('centred lines', () => {
    const plain = (text: string, center = false) => ({
        text,
        fmts: Array.from({ length: text.length }, () => ({})),
        center,
    });

    it('measures text with the width of the game font', () => {
        expect(lineWidth(plain('iii'))).toBe(6);
        expect(lineWidth(plain('abc'))).toBe(18);
        expect(lineWidth({ text: 'a', fmts: [{ bold: true }] })).toBe(7);
    });

    it('pads a centred line with spaces and leaves the others alone', () => {
        const centred = encodeMotdLines([plain('Hello', true), plain('Hello')]);
        const [first, second] = centred.split('\\n');

        expect(first.startsWith(' '.repeat(centerPadding(plain('Hello'))) + 'Hello')).toBe(true);
        expect(second).toBe('Hello');
    });

    it('does not pad an empty line', () => {
        expect(encodeMotdLines([plain('', true)])).toBe('');
    });

    it('turns the padding back into the centre setting', () => {
        const back = parseMotdLines(encodeMotdLines([plain('Welcome', true), plain('Bye')]));

        expect(back[0]).toMatchObject({ text: 'Welcome', center: true });
        expect(back[1].center).toBeUndefined();
    });

    it('keeps a few spaces typed by hand as text', () => {
        expect(parseMotdLines('   hi')[0]).toMatchObject({ text: '   hi' });
        expect(parseMotdLines('   hi')[0].center).toBeUndefined();
    });
});

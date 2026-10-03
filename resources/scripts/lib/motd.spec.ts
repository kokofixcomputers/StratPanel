import { decodeMotd, encodeMotd, parseMotd } from './motd';

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

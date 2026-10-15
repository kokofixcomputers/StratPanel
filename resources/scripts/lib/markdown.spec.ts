/**
 * @jest-environment jsdom
 */
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
    it('renders the formatting of a description', () => {
        const html = renderMarkdown('# Title\n\nSome **bold** text and a [link](https://example.com).');

        expect(html).toContain('<h1');
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('href="https://example.com"');
    });

    it('opens links in a new tab without handing over the panel', () => {
        const html = renderMarkdown('[a](https://example.com)');

        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer nofollow"');
    });

    it('removes what could take over the page', () => {
        const html = renderMarkdown(
            [
                '<script>alert(1)</script>',
                '<iframe src="https://evil.example"></iframe>',
                '<style>body{display:none}</style>',
                '<img src="https://example.com/a.png" onerror="alert(1)" style="position:fixed">',
                '<form action="https://evil.example"><input name="password"></form>',
                '<a href="javascript:alert(1)">click</a>',
            ].join('\n\n')
        );

        expect(html).not.toMatch(/<script|<iframe|<style|<form|<input/i);
        expect(html).not.toMatch(/onerror|javascript:|position:fixed/i);
        // The picture itself stays.
        expect(html).toContain('https://example.com/a.png');
    });

    it('does not break on nothing', () => {
        expect(renderMarkdown('')).toBe('');
    });
});

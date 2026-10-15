import { marked } from 'marked';
import DOMPurify from 'dompurify';

let ready = false;

/** Links leave the panel in a new tab, and pictures are loaded without telling their host which panel asked. */
const prepare = () => {
    if (ready) return;
    ready = true;

    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer nofollow');
        }
        if (node.tagName === 'IMG') {
            node.setAttribute('loading', 'lazy');
            node.setAttribute('referrerpolicy', 'no-referrer');
        }
    });
};

/**
 * Turns the Markdown of a project (which Modrinth lets contain raw HTML) into HTML that is safe to show: scripts,
 * frames, forms and styles are removed, so a description can not take over the page it is shown on.
 */
export const renderMarkdown = (source: string): string => {
    prepare();
    const html = marked.parse(source || '', { async: false, gfm: true }) as string;

    return DOMPurify.sanitize(html, {
        FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed'],
        FORBID_ATTR: ['style'],
    });
};

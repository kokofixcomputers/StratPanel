import React, { useMemo } from 'react';
import { renderHtml, renderMarkdown } from '@/lib/markdown';
import styles from './Markdown.module.css';

/** Markdown from Modrinth, or HTML from CurseForge (which Markdown would read wrong, indented lines become code). */
export default ({ source, html: isHtml }: { source: string; html?: boolean }) => {
    const html = useMemo(() => (isHtml ? renderHtml(source) : renderMarkdown(source)), [source, isHtml]);

    // The html went through DOMPurify just above.
    // eslint-disable-next-line react/no-danger
    return <div className={styles.markdown} dangerouslySetInnerHTML={{ __html: html }} />;
};

import React, { useMemo } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import styles from './Markdown.module.css';

export default ({ source }: { source: string }) => {
    const html = useMemo(() => renderMarkdown(source), [source]);

    // The html went through DOMPurify just above.
    // eslint-disable-next-line react/no-danger
    return <div className={styles.markdown} dangerouslySetInnerHTML={{ __html: html }} />;
};

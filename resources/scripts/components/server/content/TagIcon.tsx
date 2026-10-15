import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

/** The icon of a Modrinth tag. Modrinth sends it as SVG markup, which is cleaned before it is put in the page. */
export default ({ svg, size = 16 }: { svg?: string; size?: number }) => {
    const html = useMemo(
        () => (svg ? DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) : ''),
        [svg]
    );
    if (!html) return null;

    return (
        <span
            aria-hidden
            className={'inline-flex flex-shrink-0 items-center justify-center'}
            style={{ width: size, height: size }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
};

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

/**
 * The icon of a tag. Modrinth sends it as SVG markup, which is cleaned before it is put in the page, CurseForge sends the
 * address of a picture.
 */
export default ({ svg, size = 16 }: { svg?: string; size?: number }) => {
    // Markup starts with a tag, anything else is the address of a picture.
    const isAddress = !!svg && !svg.trim().startsWith('<');
    const html = useMemo(
        () => (svg && !isAddress ? DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) : ''),
        [svg]
    );
    if (isAddress) {
        return (
            <img
                src={svg}
                alt={''}
                aria-hidden
                loading={'lazy'}
                referrerPolicy={'no-referrer'}
                className={'flex-shrink-0 object-contain'}
                style={{ width: size, height: size }}
            />
        );
    }
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

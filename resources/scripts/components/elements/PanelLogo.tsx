import React from 'react';
import useBranding from '@/plugins/useBranding';
import { logoUrl } from '@/lib/branding';

/**
 * The icon of the panel: the favicon an admin uploaded under Settings > Branding, or the default one. It is the same picture as
 * the one in the tab of the browser, so changing the favicon changes the logo everywhere the panel shows it.
 */
export default ({ className }: { className?: string }) => {
    const { favicon } = useBranding();

    return <img src={logoUrl(favicon)} alt={''} draggable={false} className={className} />;
};

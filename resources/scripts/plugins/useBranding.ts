import { useMemo } from 'react';
import { useStoreState } from 'easy-peasy';
import { ApplicationStore } from '@/state';
import { Branding, parseBranding } from '@/lib/branding';

/** The favicon, announcements and links an admin set under Settings > Branding. */
export default (): Branding => {
    const raw = useStoreState((state: ApplicationStore) => state.settings.data?.branding);

    return useMemo(() => parseBranding(raw), [raw]);
};

import { useEffect, useState } from 'react';
import { isCurseForgeEnabled } from '@/lib/curseforge';

/** Whether an admin has added a CurseForge key, null until the panel has said. */
export default (): boolean | null => {
    const [enabled, setEnabled] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        isCurseForgeEnabled().then((value) => !cancelled && setEnabled(value));

        return () => {
            cancelled = true;
        };
    }, []);

    return enabled;
};

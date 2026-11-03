import { useCallback, useEffect, useState } from 'react';
import getServers from '@/api/getServers';
import { Server } from '@/api/server/getServer';
import { httpErrorToHuman } from '@/api/http';

/** All the servers the person can see (the list is paged), as they are now, not as they were when the page was opened. */
export default (enabled = true) => {
    const [servers, setServers] = useState<Server[] | null>(null);
    const [error, setError] = useState('');

    const reload = useCallback(async () => {
        try {
            const all: Server[] = [];
            for (let page = 1; page <= 10; page++) {
                const result = await getServers({ page });
                all.push(...result.items);
                if (page >= result.pagination.totalPages) break;
            }
            setServers(all);
            setError('');
        } catch (e) {
            setError(httpErrorToHuman(e));
        }
    }, []);

    useEffect(() => {
        if (enabled) reload();
    }, [enabled]);

    return { servers, error, reload };
};

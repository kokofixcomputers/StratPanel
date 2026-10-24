import { useEffect, useState } from 'react';
import useFlash from '@/plugins/useFlash';
import { saveSetting, useSetting } from '@/api/admin/settings';

/**
 * The state of a page of Settings that is one form: what is saved (kept fresh), the copy the person edits, and saving it. The server
 * answers a save with what is set after it, which replaces the copy, so the page shows what was really kept.
 */
export default <T, V>(path: string, toValues: (data: T) => V, saved: string, method: 'patch' | 'post' = 'patch') => {
    const { data, error, mutate } = useSetting<T>(path);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [values, setValues] = useState<V | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (data) setValues(toValues(data));
    }, [data]);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'admin', error });
    }, [error]);

    const save = (body: unknown = values, message = saved): Promise<T | undefined> => {
        clearFlashes('admin');
        setBusy(true);

        return saveSetting<T>(path, body, method)
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message });
                // Some answers are only "saved"; those pages look again.
                return fresh && typeof fresh === 'object' && 'saved' in (fresh as object)
                    ? mutate().then(() => undefined)
                    : mutate(fresh, false).then(() => fresh);
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                return undefined;
            })
            .then((result) => {
                setBusy(false);
                return result;
            });
    };

    return {
        data,
        values,
        setValues,
        set: (changes: Partial<V>) => setValues((v) => (v ? { ...v, ...changes } : v)),
        busy,
        save,
        mutate,
    };
};

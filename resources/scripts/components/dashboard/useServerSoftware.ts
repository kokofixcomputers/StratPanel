import { useEffect, useState } from 'react';
import detectCurrent from '@/components/server/versions/detectCurrent';
import { readPterodactylJson } from '@/lib/pterodactylJson';

const STORAGE_KEY = 'stratpanel:server-software';
const FOUND_TTL = 24 * 60 * 60 * 1000;
const MISSING_TTL = 10 * 60 * 1000;

type Entry = { type: string | null; at: number };

const readStore = (): Record<string, Entry> => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
        return {};
    }
};

const writeStore = (uuid: string, entry: Entry) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStore(), [uuid]: entry }));
    } catch (e) {
        // The background is a nicety, so storage that is full or blocked is fine.
    }
};

// Every lookup talks to a node, so only a few run at the same time however many servers are listed.
let running = 0;
const waiting: Array<() => void> = [];
const limit = async <T>(work: () => Promise<T>): Promise<T> => {
    if (running >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
        return await work();
    } finally {
        running--;
        waiting.shift()?.();
    }
};

const lookup = async (uuid: string): Promise<string | null> => {
    const marked = await readPterodactylJson(uuid).catch(() => ({}));
    if (typeof (marked as any).software === 'string') return (marked as any).software;

    return (await detectCurrent(uuid, null)).type;
};

/** The Minecraft software a server runs (PAPER, FABRIC...), found from its files and remembered for a while. */
export default (uuid: string, enabled: boolean): string | null => {
    const cached = readStore()[uuid];
    const fresh = cached && Date.now() - cached.at < (cached.type ? FOUND_TTL : MISSING_TTL);
    const [type, setType] = useState<string | null>(fresh ? cached.type : null);

    useEffect(() => {
        if (!enabled || fresh) return;

        let cancelled = false;
        limit(() => lookup(uuid))
            .then((found) => {
                writeStore(uuid, { type: found, at: Date.now() });
                if (!cancelled) setType(found);
            })
            .catch(() => writeStore(uuid, { type: null, at: Date.now() }));

        return () => {
            cancelled = true;
        };
    }, [uuid, enabled]);

    return type;
};

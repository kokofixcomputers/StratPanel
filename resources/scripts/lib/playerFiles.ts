/**
 * Bans and operators live in banned-players.json and ops.json. While the server is stopped they can be edited
 * directly, a running server keeps them in memory and would overwrite the files, so it is sent commands instead.
 */
import saveFileContents from '@/api/server/files/saveFileContents';
import { readJsonList } from '@/lib/minecraft';

export const OPS_FILE = '/ops.json';
export const BANS_FILE = '/banned-players.json';

interface Entry {
    uuid: string;
    name: string;
    [key: string]: unknown;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The timestamp format Minecraft writes, in UTC. */
export const minecraftDate = (date: Date = new Date()): string =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;

export const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

const write = (uuid: string, file: string, entries: Entry[]) =>
    saveFileContents(uuid, file, `${JSON.stringify(entries, null, 2)}\n`);

const without = (entries: Entry[], name: string) => entries.filter((e) => e.name.toLowerCase() !== name.toLowerCase());

export const setOperator = async (server: string, player: { uuid: string; name: string }, op: boolean) => {
    const entries = without(await readJsonList<Entry>(server, OPS_FILE), player.name);
    if (op) entries.push({ uuid: player.uuid, name: player.name, level: 4, bypassesPlayerLimit: false });

    await write(server, OPS_FILE, entries);
};

export const setBanned = async (
    server: string,
    player: { uuid: string; name: string },
    banned: boolean,
    reason = 'Banned by an operator.'
) => {
    const entries = without(await readJsonList<Entry>(server, BANS_FILE), player.name);
    if (banned) {
        entries.push({
            uuid: player.uuid,
            name: player.name,
            created: minecraftDate(),
            source: 'Panel',
            expires: 'forever',
            reason,
        });
    }

    await write(server, BANS_FILE, entries);
};

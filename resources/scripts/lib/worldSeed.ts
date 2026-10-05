/**
 * Finds the seed of a world. The "level-seed" property in server.properties is empty on a world that got a random seed,
 * so the seed has to come from the world itself. Where Minecraft keeps it depends on the version:
 *   26.x   world/dimensions/minecraft/overworld/data/minecraft/world_gen_settings.dat   data.seed
 *   1.21.x world/data/minecraft/world_gen_settings.dat (newer builds)                   data.seed
 *   1.16+  world/level.dat                                                              Data.WorldGenSettings.seed
 *   older  world/level.dat                                                              Data.RandomSeed
 */
import { gunzipSync } from 'fflate';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import { parseProperties, readOptionalFile } from '@/lib/minecraft';

type Nbt = bigint | number | string | Nbt[] | { [key: string]: Nbt } | null;

/** Reads an uncompressed NBT file into plain objects. Longs become bigints so seeds keep all 64 bits. */
export const parseNbt = (bytes: Uint8Array): Nbt => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 0;

    const text = () => {
        const length = view.getUint16(pos);
        pos += 2;
        const value = new TextDecoder().decode(bytes.subarray(pos, pos + length));
        pos += length;

        return value;
    };

    const payload = (type: number): Nbt => {
        switch (type) {
            case 1:
                return view.getInt8(pos++);
            case 2:
                pos += 2;
                return view.getInt16(pos - 2);
            case 3:
                pos += 4;
                return view.getInt32(pos - 4);
            case 4:
                pos += 8;
                return view.getBigInt64(pos - 8);
            case 5:
                pos += 4;
                return view.getFloat32(pos - 4);
            case 6:
                pos += 8;
                return view.getFloat64(pos - 8);
            case 7:
            case 11:
            case 12: {
                const length = view.getInt32(pos);
                pos += 4 + length * (type === 7 ? 1 : type === 11 ? 4 : 8);
                return null;
            }
            case 8:
                return text();
            case 9: {
                const inner = view.getUint8(pos++);
                const length = view.getInt32(pos);
                pos += 4;

                return Array.from({ length }, () => payload(inner));
            }
            case 10: {
                const compound: { [key: string]: Nbt } = {};
                for (let tag = view.getUint8(pos++); tag !== 0; tag = view.getUint8(pos++)) {
                    const name = text();
                    compound[name] = payload(tag);
                }

                return compound;
            }
            default:
                throw new Error(`Unknown NBT tag ${type}`);
        }
    };

    const root = view.getUint8(pos++);
    text();

    return payload(root);
};

const child = (value: Nbt | undefined, key: string): Nbt | undefined =>
    value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined;

const asSeed = (value: Nbt | undefined): string | null =>
    typeof value === 'bigint' || typeof value === 'number' ? String(value) : null;

/** The seed out of an NBT file, whichever of the layouts above it has. */
export const seedFromNbt = (root: Nbt): string | null =>
    asSeed(child(child(root, 'data'), 'seed')) ??
    asSeed(child(child(child(root, 'Data'), 'WorldGenSettings'), 'seed')) ??
    asSeed(child(child(root, 'Data'), 'RandomSeed'));

/** Downloads a file as bytes, null when it does not exist. */
const download = async (uuid: string, path: string): Promise<Uint8Array | null> => {
    try {
        const response = await fetch(await getFileDownloadUrl(uuid, path));
        if (!response.ok) return null;

        return new Uint8Array(await response.arrayBuffer());
    } catch (e) {
        return null;
    }
};

const read = async (uuid: string, path: string): Promise<string | null> => {
    const bytes = await download(uuid, path);
    if (!bytes) return null;

    try {
        // NBT files are gzip compressed, but be forgiving about one that is not.
        return seedFromNbt(parseNbt(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes));
    } catch (e) {
        return null;
    }
};

/** The seed of the server's world, or null when it can not be found. */
export const readWorldSeed = async (uuid: string): Promise<string | null> => {
    const properties = parseProperties((await readOptionalFile(uuid, '/server.properties')) || '');
    const value = (key: string) => properties.find((line) => line.key === key)?.value?.trim() || '';
    const world = `/${value('level-name') || 'world'}`;

    for (const path of [
        `${world}/dimensions/minecraft/overworld/data/minecraft/world_gen_settings.dat`,
        `${world}/data/minecraft/world_gen_settings.dat`,
        `${world}/level.dat`,
    ]) {
        const seed = await read(uuid, path);
        if (seed) return seed;
    }

    // A seed that was set by hand is only a fallback, it is empty on a world that was generated at random.
    return value('level-seed') || null;
};

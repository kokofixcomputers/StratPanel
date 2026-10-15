/**
 * A lossless reader and writer for NBT files. Every tag keeps its type, so a file that is read and written again has the
 * same content, which is what editing a world file needs: worldSeed.ts only reads and drops what it does not need.
 * Compounds keep the order of their entries.
 */
import { gunzipSync, gzipSync } from 'fflate';

export type Tag =
    | { t: 1 | 2 | 3 | 5 | 6; v: number }
    | { t: 4; v: bigint }
    | { t: 7; v: Int8Array }
    | { t: 8; v: string }
    | { t: 9; item: number; v: Tag[] }
    | { t: 10; v: Map<string, Tag> }
    | { t: 11; v: Int32Array }
    | { t: 12; v: BigInt64Array };

export interface NbtFile {
    // The name of the root tag, empty in every file of a world.
    name: string;
    root: Tag;
}

export const TAG = {
    BYTE: 1,
    SHORT: 2,
    INT: 3,
    LONG: 4,
    FLOAT: 5,
    DOUBLE: 6,
    STRING: 8,
    LIST: 9,
    COMPOUND: 10,
} as const;

const MAX_DEPTH = 64;

/** Reads a file, gzip compressed or not (the game compresses them, but be forgiving). */
export const readNbt = (input: Uint8Array): NbtFile => {
    const bytes = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 0;

    const need = (count: number) => {
        if (pos + count > bytes.length) throw new Error('The NBT file ends too early.');
    };
    const text = (): string => {
        need(2);
        const length = view.getUint16(pos);
        pos += 2;
        need(length);
        const value = new TextDecoder().decode(bytes.subarray(pos, pos + length));
        pos += length;

        return value;
    };
    const count = (): number => {
        need(4);
        const length = view.getInt32(pos);
        pos += 4;
        if (length < 0) throw new Error('The NBT file has a negative length.');

        return length;
    };

    const payload = (type: number, depth: number): Tag => {
        if (depth > MAX_DEPTH) throw new Error('The NBT file is nested too deeply.');
        switch (type) {
            case 1:
                need(1);
                return { t: 1, v: view.getInt8(pos++) };
            case 2:
                need(2);
                pos += 2;
                return { t: 2, v: view.getInt16(pos - 2) };
            case 3:
                need(4);
                pos += 4;
                return { t: 3, v: view.getInt32(pos - 4) };
            case 4:
                need(8);
                pos += 8;
                return { t: 4, v: view.getBigInt64(pos - 8) };
            case 5:
                need(4);
                pos += 4;
                return { t: 5, v: view.getFloat32(pos - 4) };
            case 6:
                need(8);
                pos += 8;
                return { t: 6, v: view.getFloat64(pos - 8) };
            case 7: {
                const length = count();
                need(length);
                const value = new Int8Array(bytes.slice(pos, pos + length).buffer);
                pos += length;

                return { t: 7, v: value };
            }
            case 8:
                return { t: 8, v: text() };
            case 9: {
                need(1);
                const item = view.getUint8(pos++);
                const length = count();

                return { t: 9, item, v: Array.from({ length }, () => payload(item, depth + 1)) };
            }
            case 10: {
                const entries = new Map<string, Tag>();
                for (;;) {
                    need(1);
                    const tag = view.getUint8(pos++);
                    if (tag === 0) break;
                    const name = text();
                    entries.set(name, payload(tag, depth + 1));
                }

                return { t: 10, v: entries };
            }
            case 11: {
                const length = count();
                need(length * 4);
                const value = new Int32Array(length);
                for (let i = 0; i < length; i++, pos += 4) value[i] = view.getInt32(pos);

                return { t: 11, v: value };
            }
            case 12: {
                const length = count();
                need(length * 8);
                const value = new BigInt64Array(length);
                for (let i = 0; i < length; i++, pos += 8) value[i] = view.getBigInt64(pos);

                return { t: 12, v: value };
            }
            default:
                throw new Error(`Unknown NBT tag ${type}.`);
        }
    };

    need(1);
    const type = view.getUint8(pos++);
    if (type !== 10) throw new Error('This is not an NBT file.');
    const name = text();

    return { name, root: payload(type, 0) };
};

/** Writes a file, gzip compressed like the game does. */
export const writeNbt = (file: NbtFile, compress = true): Uint8Array => {
    const chunks: Uint8Array[] = [];
    const encoder = new TextEncoder();
    let size = 0;
    const push = (chunk: Uint8Array) => {
        chunks.push(chunk);
        size += chunk.length;
    };
    const scratch = (length: number, fill: (view: DataView) => void) => {
        const bytes = new Uint8Array(length);
        fill(new DataView(bytes.buffer));
        push(bytes);
    };
    const text = (value: string) => {
        const encoded = encoder.encode(value);
        if (encoded.length > 0xffff) throw new Error('An NBT string is too long.');
        scratch(2, (v) => v.setUint16(0, encoded.length));
        push(encoded);
    };

    const payload = (tag: Tag) => {
        switch (tag.t) {
            case 1:
                return scratch(1, (v) => v.setInt8(0, tag.v));
            case 2:
                return scratch(2, (v) => v.setInt16(0, tag.v));
            case 3:
                return scratch(4, (v) => v.setInt32(0, tag.v));
            case 4:
                return scratch(8, (v) => v.setBigInt64(0, tag.v));
            case 5:
                return scratch(4, (v) => v.setFloat32(0, tag.v));
            case 6:
                return scratch(8, (v) => v.setFloat64(0, tag.v));
            case 7:
                scratch(4, (v) => v.setInt32(0, tag.v.length));
                return push(new Uint8Array(tag.v.buffer.slice(tag.v.byteOffset, tag.v.byteOffset + tag.v.length)));
            case 8:
                return text(tag.v);
            case 9:
                scratch(5, (v) => {
                    v.setUint8(0, tag.item);
                    v.setInt32(1, tag.v.length);
                });
                return tag.v.forEach(payload);
            case 10:
                tag.v.forEach((child, name) => {
                    scratch(1, (v) => v.setUint8(0, child.t));
                    text(name);
                    payload(child);
                });
                return scratch(1, (v) => v.setUint8(0, 0));
            case 11:
                scratch(4, (v) => v.setInt32(0, tag.v.length));
                return scratch(tag.v.length * 4, (v) => tag.v.forEach((n, i) => v.setInt32(i * 4, n)));
            case 12:
                scratch(4, (v) => v.setInt32(0, tag.v.length));
                return scratch(tag.v.length * 8, (v) => tag.v.forEach((n, i) => v.setBigInt64(i * 8, n)));
        }
    };

    scratch(1, (v) => v.setUint8(0, 10));
    text(file.name);
    payload(file.root);

    const out = new Uint8Array(size);
    let offset = 0;
    chunks.forEach((chunk) => {
        out.set(chunk, offset);
        offset += chunk.length;
    });

    return compress ? gzipSync(out) : out;
};

/** The tag at a path of compound names, undefined when any step is missing or is not a compound. */
export const getTag = (root: Tag, ...path: string[]): Tag | undefined => {
    let current: Tag | undefined = root;
    for (const key of path) {
        if (!current || current.t !== 10) return undefined;
        current = current.v.get(key);
    }

    return current;
};

/** A copy of the tree with the tag at the path replaced. The path has to exist, nothing is created by accident. */
export const withTag = (root: Tag, path: string[], replacement: Tag): Tag => {
    if (path.length === 0) return replacement;
    if (root.t !== 10) throw new Error(`There is no compound at ${path.join('/')}.`);
    const [head, ...rest] = path;
    const current = root.v.get(head);
    if (!current) throw new Error(`There is no ${head} to change.`);
    const entries = new Map(root.v);
    entries.set(head, withTag(current, rest, replacement));

    return { t: 10, v: entries };
};

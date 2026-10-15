#!/usr/bin/env node
/**
 * Puts the textures of one version of Minecraft in the folder the panel's tools serve them from, with the same layout as the
 * versions that come with the tools (mc-assets/<version>/blocks, items, entity and blocks_models.json). The panel draws the
 * items and blocks of the player inventory from them, which is how a server on a version newer than the bundled ones shows
 * its own new items and blocks.
 *
 *   node tools/fetch-mc-textures.mjs [version] [folder]
 *
 * It downloads the client of that version from Mojang (once, it is kept in .cache and checked against the hash Mojang
 * publishes), reads only the pictures and models it needs from it and writes them out. Nothing of the client is kept in the
 * repository, the folder is built output like the rest of public/tools.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] || '26.3';
const out = resolve(process.argv[3] || join(root, 'public/tools/mc-assets', version));
const cache = join(root, '.cache/minecraft', `${version}.jar`);

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

const json = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);

    return response.json();
};

const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex');

/** The client jar of the version, from the cache when it is there and still matches what Mojang says it is. */
const clientJar = async () => {
    const manifest = await json(MANIFEST);
    const entry = manifest.versions.find((v) => v.id === version);
    if (!entry) throw new Error(`Mojang has no version ${version}`);
    const { url, sha1: expected } = (await json(entry.url)).downloads.client;

    if (existsSync(cache) && sha1(readFileSync(cache)) === expected) return readFileSync(cache);

    console.log(`Downloading the client of ${version}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha1(bytes) !== expected) throw new Error('The client that was downloaded is not the one Mojang published.');
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(cache, bytes);

    return bytes;
};

const PREFIX = 'assets/minecraft/';
// Where each kind of picture goes: the folders of the client, to the folders of the tools.
const FILES = [
    [/^textures\/block\/[^/]+\.png$/, 'blocks'],
    [/^textures\/item\/[^/]+\.png$/, 'items'],
    [/^textures\/entity\/chest\/[^/]+\.png$/, 'entity/chest'],
    [/^textures\/entity\/shield\/shield_base_nopattern\.png$/, 'entity/shield'],
];
const MODELS = /^models\/block\/([^/]+)\.json$/;

const bytes = await clientJar();
const files = unzipSync(bytes, {
    filter: (file) => {
        if (!file.name.startsWith(PREFIX)) return false;
        const name = file.name.slice(PREFIX.length);

        return FILES.some(([pattern]) => pattern.test(name)) || MODELS.test(name);
    },
});

const counts = {};
const models = {};
for (const [path, data] of Object.entries(files)) {
    const name = path.slice(PREFIX.length);
    const model = MODELS.exec(name);
    if (model) {
        // The panel only needs to know what a block is (its parent) and which textures it has.
        const { parent, textures } = JSON.parse(new TextDecoder().decode(data));
        models[model[1]] = { ...(parent ? { parent } : {}), ...(textures ? { textures } : {}) };
        continue;
    }

    const [, folder] = FILES.find(([pattern]) => pattern.test(name));
    const target = join(out, folder, name.slice(name.lastIndexOf('/') + 1));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    counts[folder] = (counts[folder] || 0) + 1;
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'blocks_models.json'), JSON.stringify(models));

console.log(
    `Textures of ${version} written to ${out}: ${Object.entries(counts)
        .map(([folder, count]) => `${count} in ${folder}`)
        .join(', ')}, ${Object.keys(models).length} block models.`
);

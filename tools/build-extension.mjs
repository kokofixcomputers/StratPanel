#!/usr/bin/env node
/**
 * Builds a .stratext from the folder of an extension: checks extension.json, minifies the JavaScript and CSS under web/, and zips
 * the folder.
 *
 *   node tools/build-extension.mjs <folder> [--out <folder>] [--no-minify]
 *
 * The result is <out>/<id>-<version>.stratext (default out: dist/extensions). The same input gives the same file, byte for byte.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { minify } from 'terser';

// Never part of an extension: what a development folder collects, and what would be a package inside a package.
const SKIP_NAMES = new Set(['node_modules', '.git', '.idea', '.vscode', '.DS_Store', 'dist', 'Thumbs.db']);
const SKIP_SUFFIXES = ['.stratext', '.log', '.swp', '~'];
// The same day for every file, so building twice makes the same package.
const FIXED_TIME = new Date('2026-01-01T00:00:00Z');

const fail = (message) => {
    console.error(`\n  ${message}\n`);
    process.exit(1);
};

/** The checks of the installer that can be made without the panel. The panel checks everything again when it installs. */
export const checkManifest = (manifest, files) => {
    const problems = [];
    if (manifest.api !== 1) problems.push('"api" has to be 1');
    if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(manifest.id || '')) problems.push('"id" has to be 3 to 48 characters: a-z, 0-9 and -');
    if (!/^\d+\.\d+\.\d+([-+][0-9A-Za-z.\-+]*)?$/.test(manifest.version || '')) problems.push('"version" has to be like 1.2.3');
    if (!manifest.name) problems.push('"name" is missing');
    if (manifest.php?.main && !manifest.php?.autoload) problems.push('"php.main" needs "php.autoload"');

    const unsafe = (path) => typeof path !== 'string' || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..');
    for (const file of [...(manifest.web?.scripts || []), ...(manifest.web?.styles || [])]) {
        if (unsafe(file) || !file.startsWith('web/')) problems.push(`"${file}" has to be a file inside web/`);
        else if (!files.has(file)) problems.push(`"${file}" is named in extension.json but is not in the folder`);
    }
    for (const [prefix, folder] of Object.entries(manifest.php?.autoload || {})) {
        if (!prefix.endsWith('\\')) problems.push(`the namespace "${prefix}" has to end in \\`);
        if (unsafe(folder) || ![...files.keys()].some((f) => f.startsWith(folder.replace(/\/*$/, '/')))) problems.push(`"${folder}" (php.autoload) has no files`);
    }
    if (manifest.php?.main) {
        const path = [...Object.entries(manifest.php.autoload || {})]
            .filter(([prefix]) => manifest.php.main.startsWith(prefix))
            .map(([prefix, folder]) => `${folder.replace(/\/*$/, '/')}${manifest.php.main.slice(prefix.length).replace(/\\/g, '/')}.php`)[0];
        if (!path || !files.has(path)) problems.push(`the class "${manifest.php.main}" (php.main) is not where php.autoload says: ${path || 'no namespace matches'}`);
    }
    const keys = new Set();
    for (const setting of manifest.settings || []) {
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(setting.key || '')) problems.push(`the setting key "${setting.key}" is not valid`);
        if (keys.has(setting.key)) problems.push(`the setting "${setting.key}" is there twice`);
        keys.add(setting.key);
        if (!['text', 'textarea', 'number', 'boolean', 'select', 'password'].includes(setting.type)) problems.push(`the setting "${setting.key}" has an unknown type`);
    }

    return problems;
};

const walk = (root) => {
    const files = new Map();
    const visit = (directory) => {
        for (const entry of readdirSync(directory).sort()) {
            if (SKIP_NAMES.has(entry) || SKIP_SUFFIXES.some((suffix) => entry.endsWith(suffix))) continue;

            const path = join(directory, entry);
            const stat = lstatSync(path);
            // A link is not followed and not packed: the installer refuses packages with links.
            if (stat.isSymbolicLink()) continue;
            if (stat.isDirectory()) visit(path);
            else files.set(relative(root, path).split(sep).join('/'), readFileSync(path));
        }
    };
    visit(root);

    return files;
};

const minifyCss = (css) =>
    css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,>])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();

export const build = async (folder, { out = 'dist/extensions', minifyFiles = true } = {}) => {
    const root = resolve(folder);
    if (!existsSync(join(root, 'extension.json'))) throw new Error(`There is no extension.json in ${root}`);

    const files = walk(root);
    let manifest;
    try {
        manifest = JSON.parse(files.get('extension.json').toString('utf8'));
    } catch (error) {
        throw new Error(`extension.json is not valid JSON: ${error.message}`);
    }

    const problems = checkManifest(manifest, files);
    if (problems.length) throw new Error(`extension.json has problems:\n   - ${problems.join('\n   - ')}`);

    let saved = 0;
    const entries = {};
    for (const [path, content] of files) {
        let data = content;
        if (minifyFiles && path.startsWith('web/') && path.endsWith('.js') && !path.endsWith('.min.js')) {
            const result = await minify(content.toString('utf8'), { compress: true, mangle: true, format: { comments: false } });
            if (result.error || !result.code) throw new Error(`${path} could not be minified: ${result.error?.message || 'no output'}`);
            data = Buffer.from(result.code);
        } else if (minifyFiles && path.startsWith('web/') && path.endsWith('.css') && !path.endsWith('.min.css')) {
            data = Buffer.from(minifyCss(content.toString('utf8')));
        }
        saved += content.length - data.length;
        entries[path] = [data, { mtime: FIXED_TIME, os: 3, attrs: (0o100644 << 16) >>> 0 }];
    }

    const zip = zipSync(entries, { level: 9 });
    mkdirSync(resolve(out), { recursive: true });
    const target = join(resolve(out), `${manifest.id}-${manifest.version}.stratext`);
    writeFileSync(target, zip);

    return { target, id: manifest.id, version: manifest.version, files: files.size, bytes: zip.length, saved, manifest };
};

const main = async () => {
    const args = process.argv.slice(2);
    const folder = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');
    const outAt = args.indexOf('--out');
    if (!folder) fail('Usage: node tools/build-extension.mjs <folder> [--out <folder>] [--no-minify]');

    try {
        const result = await build(folder, { out: outAt >= 0 ? args[outAt + 1] : 'dist/extensions', minifyFiles: !args.includes('--no-minify') });
        console.log(`\n  Built ${result.manifest.name} ${result.version}`);
        console.log(`  ${result.files} files, ${(result.bytes / 1024).toFixed(1)} KB${result.saved > 0 ? ` (${(result.saved / 1024).toFixed(1)} KB less after minifying)` : ''}`);
        console.log(`  ${relative(process.cwd(), result.target)}\n`);
        console.log(`  Install it:  php artisan p:extension:install ${relative(process.cwd(), result.target)}\n`);
    } catch (error) {
        fail(error.message);
    }
};

if (process.argv[1] && basename(process.argv[1]) === 'build-extension.mjs') await main();

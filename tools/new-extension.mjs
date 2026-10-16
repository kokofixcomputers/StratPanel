#!/usr/bin/env node
/**
 * Makes a new extension from the template.
 *   node tools/new-extension.mjs <id> ["Name"]     ->  extensions/<id>/
 */
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const studly = (id) => id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
export const title = (id) => id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

export const scaffold = (id, name = title(id), root = resolve('extensions')) => {
    if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(id)) throw new Error('The id has to be 3 to 48 characters: a-z, 0-9 and -');
    const target = join(root, id);
    if (existsSync(target)) throw new Error(`${target} exists already`);

    cpSync(join(root, '_template'), target, { recursive: true });
    // The class gets the name of the extension.
    renameSync(join(target, 'src', 'MyExtension.php'), join(target, 'src', `${studly(id)}.php`));

    const replace = (directory) => {
        for (const entry of readdirSync(directory)) {
            const path = join(directory, entry);
            if (statSync(path).isDirectory()) replace(path);
            else if (/\.(php|json|js|css|md)$/.test(entry)) {
                writeFileSync(
                    path,
                    readFileSync(path, 'utf8')
                        .replaceAll('my-extension', id)
                        .replaceAll('MyExtension', studly(id))
                        .replaceAll('My Extension', name)
                );
            }
        }
    };
    replace(target);
    return target;
};

if (process.argv[1]?.endsWith('new-extension.mjs')) {
    const [id, name] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    if (!id) {
        console.error('\n  Usage: node tools/new-extension.mjs <id> ["Name"]\n');
        process.exit(1);
    }
    try {
        const target = scaffold(id, name);
        console.log(`\n  Made ${target}\n  Build it:  npm run ext:build -- extensions/${id}\n`);
    } catch (error) {
        console.error(`\n  ${error.message}\n`);
        process.exit(1);
    }
}

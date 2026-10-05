/**
 * Reads pterodactyl.commands.json, the command tree a plugin or mod writes into the server root, and turns it
 * into the tree the console tab completion walks. The format is described in docs/pterodactyl-commands.md.
 */
import { Node, node } from '@/lib/commandComplete';

export const COMMANDS_FILE = 'pterodactyl.commands.json';
export const SUPPORTED_VERSION = 1;

const MAX_NODES = 100000;
const MAX_DEPTH = 32;

export interface CommandNodeJson {
    name: string;
    type?: 'literal' | 'argument';
    // Argument parser, the identifiers of the vanilla command tree, for example "minecraft:gamemode".
    parser?: string;
    suggestions?: string[];
    aliases?: string[];
    description?: string;
    permission?: string;
    plugin?: string;
    executable?: boolean;
    // Path of literal names from the root. The node carries on like the node at that path, which is how a command
    // such as "execute" can lead back to itself.
    redirect?: string[];
    children?: CommandNodeJson[];
}

export interface CommandsDocument {
    version: number;
    generatedAt: string;
    generator?: { name?: string; version?: string; platform?: string; minecraft?: string };
    plugins?: { name: string; version?: string }[];
    root: { children: CommandNodeJson[] };
}

/** How the arguments of the vanilla command tree map onto the suggestions the console knows. */
export const PARSER_TYPES: Record<string, string> = {
    'minecraft:entity': 'sel',
    'minecraft:score_holder': 'sel',
    'minecraft:game_profile': 'sel',
    'brigadier:bool': 'bool',
    'minecraft:gamemode': 'gm',
    'minecraft:vec3': 'pos',
    'minecraft:vec2': 'pos',
    'minecraft:block_pos': 'pos',
    'minecraft:column_pos': 'pos',
    'minecraft:rotation': 'pos',
    'minecraft:dimension': 'dim',
    'minecraft:mob_effect': 'effect',
    'minecraft:enchantment': 'ench',
    'minecraft:color': 'color',
};

const isObject = (value: unknown): value is Record<string, any> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const strings = (value: unknown, limit = 500): string[] =>
    Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length < 200).slice(0, limit)
        : [];

/** Parses the file, returns null when it is not a command tree this version of the panel understands. */
export const parseCommandsDocument = (raw: string): CommandsDocument | null => {
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        return null;
    }

    if (!isObject(data) || data.version !== SUPPORTED_VERSION || !isObject(data.root)) return null;
    if (!Array.isArray(data.root.children)) return null;

    return data as unknown as CommandsDocument;
};

/**
 * Builds the tree for tab completion. Anything malformed is skipped instead of failing the whole file, so one bad
 * node of a plugin never takes the other commands away.
 */
export const buildCommandTree = (doc: CommandsDocument): { tree: Node; count: number } => {
    const root = node();
    const pending: { from: Node; path: string[] }[] = [];
    let count = 0;

    const add = (parent: Node, children: unknown, depth: number) => {
        if (!Array.isArray(children) || depth > MAX_DEPTH) return;

        children.forEach((raw) => {
            if (!isObject(raw) || typeof raw.name !== 'string' || !raw.name || count >= MAX_NODES) return;
            count++;
            const json = raw as CommandNodeJson;
            const description = typeof json.description === 'string' ? json.description.slice(0, 200) : undefined;

            let child: Node;
            if (json.type === 'argument') {
                const type = json.parser ? PARSER_TYPES[json.parser] : undefined;
                const key = `${json.name}:${type || 'custom'}`;
                child = parent.arg.get(key) || node();
                parent.arg.set(key, child);

                const suggestions = strings(json.suggestions);
                if (suggestions.length)
                    child.suggestions = Array.from(new Set([...(child.suggestions || []), ...suggestions]));
            } else {
                // Command words cannot contain spaces, the name is the word that is typed.
                if (/\s/.test(json.name)) return;
                child = parent.lit.get(json.name) || node();
                parent.lit.set(json.name, child);
                strings(json.aliases, 50)
                    .filter((alias) => !/\s/.test(alias) && !parent.lit.has(alias))
                    .forEach((alias) => parent.lit.set(alias, child));
            }
            if (description) child.description = description;

            if (Array.isArray(json.redirect)) pending.push({ from: child, path: strings(json.redirect, MAX_DEPTH) });
            add(child, json.children, depth + 1);
        });
    };

    add(root, doc.root.children, 0);

    pending.forEach(({ from, path }) => {
        let target: Node | undefined = root;
        for (const word of path) target = target?.lit.get(word);
        if (target && target !== from) from.links.push(target);
    });

    return { tree: root, count };
};

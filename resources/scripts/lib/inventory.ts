/**
 * The inventory of a player who is online, from the "inventory" message of the Stratosphere plugin (protocol 4):
 *   {"event":"inventory","name":"Steve","uuid":"…","items":[{"slot":0,"id":"minecraft:diamond_sword","count":1,
 *   "damage":12,"maxDamage":1561,"name":"Excalibur","enchants":{"sharpness":5}}]}
 * Slots are numbered like the Bukkit API does: 0 to 8 the hotbar, 9 to 35 the rest of the inventory, 36 to 39 boots,
 * leggings, chestplate and helmet, 40 the off hand. The ender chest comes the same way as an "enderchest" message with the slots 0 to
 * 26. Only messages that passed the trust check of the bridge are handed to this.
 */
import { useEffect, useState } from 'react';
import { BRIDGE_COMMAND, BridgeMessage, toPlayer } from '@/lib/bridge';

export interface InventoryItem {
    slot: number;
    // "minecraft:diamond_sword".
    id: string;
    count: number;
    damage?: number;
    maxDamage?: number;
    // The name a player gave it, if any.
    name?: string;
    enchants?: Record<string, number>;
}

export const SLOT_COUNT = 41;
// The ender chest has 3 rows of 9, slot 0 to 26.
export const ENDER_SLOT_COUNT = 27;
// A shulker box is laid out the same: 3 rows of 9.
export const SHULKER_SLOT_COUNT = 27;
export const HELMET = 39;
export const CHESTPLATE = 38;
export const LEGGINGS = 37;
export const BOOTS = 36;
export const OFF_HAND = 40;

const ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/** Whether an item is a shulker box, of any colour. A double click on one opens it. */
export const isShulkerBox = (id: string): boolean => /(^|:)([a-z_]+_)?shulker_box$/.test(id);
const ENCHANT = /^[a-z0-9_.-]{1,60}$/;

const whole = (value: unknown, min: number, max: number): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;

/** One item of a message, null when anything about it is not something the plugin could have sent. */
export const parseItem = (value: unknown, slots = SLOT_COUNT): InventoryItem | null => {
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    const slot = whole(v.slot, 0, slots - 1);
    const count = whole(v.count, 1, 99);
    if (slot === null || count === null || typeof v.id !== 'string' || !ID.test(v.id) || v.id.length > 100) return null;

    const item: InventoryItem = { slot, id: v.id, count };
    const damage = whole(v.damage, 0, 100000);
    const maxDamage = whole(v.maxDamage, 1, 100000);
    if (damage !== null && maxDamage !== null) {
        item.damage = damage;
        item.maxDamage = maxDamage;
    }
    if (typeof v.name === 'string' && v.name.trim()) item.name = v.name.slice(0, 80);
    if (v.enchants && typeof v.enchants === 'object') {
        const enchants: Record<string, number> = {};
        Object.entries(v.enchants as Record<string, unknown>)
            .slice(0, 20)
            .forEach(([key, level]) => {
                const n = whole(level, 1, 1000);
                if (ENCHANT.test(key) && n !== null) enchants[key] = n;
            });
        if (Object.keys(enchants).length) item.enchants = enchants;
    }

    return item;
};

const parseItems = (
    message: BridgeMessage,
    event: string,
    slots: number
): { name: string; items: InventoryItem[] } | null => {
    if (message.event !== event || !Array.isArray(message.items)) return null;
    const player = toPlayer(message);
    if (!player) return null;

    const items: InventoryItem[] = [];
    message.items.slice(0, slots).forEach((entry) => {
        const item = parseItem(entry, slots);
        if (item && !items.some((other) => other.slot === item.slot)) items.push(item);
    });

    return { name: player.name, items };
};

/** The player and the items of an inventory message. An item that is not valid is left out, so is a second one in a slot. */
export const parseInventory = (message: BridgeMessage) => parseItems(message, 'inventory', SLOT_COUNT);

/** The same for the ender chest. */
export const parseEnderChest = (message: BridgeMessage) => parseItems(message, 'enderchest', ENDER_SLOT_COUNT);

/** Where a shulker box is: in the inventory of the player or in the ender chest. */
export type BoxWhere = 'inv' | 'ender';

/** What is in a shulker box, and which box it is: the slot of the inventory or the ender chest it lies in. */
export interface ShulkerBoxView {
    where: BoxWhere;
    // The slot the box itself is in.
    box: number;
    // The item of the box, for its colour and name.
    boxId: string;
    items: InventoryItem[];
}

/** The player and the contents of a "shulkerbox" message, null when it is not one the plugin could have sent. */
export const parseShulkerBox = (message: BridgeMessage): { name: string; view: ShulkerBoxView } | null => {
    const parsed = parseItems(message, 'shulkerbox', SHULKER_SLOT_COUNT);
    if (!parsed) return null;

    const where = message.where;
    const box = whole(message.box, 0, SLOT_COUNT - 1);
    const boxId = message.boxId;
    if ((where !== 'inv' && where !== 'ender') || box === null) return null;
    if (where === 'ender' && box >= ENDER_SLOT_COUNT) return null;
    if (typeof boxId !== 'string' || !ID.test(boxId) || boxId.length > 100 || !isShulkerBox(boxId)) return null;

    return { name: parsed.name, view: { where, box, boxId, items: parsed.items } };
};

// ---- the store ---------------------------------------------------------------------------------------------------------

export interface PlayerError {
    name: string;
    action: string;
    error: string;
    at: number;
}

const inventories = new Map<string, Record<string, InventoryItem[]>>();
const enderChests = new Map<string, Record<string, InventoryItem[]>>();
const shulkerBoxes = new Map<string, Record<string, ShulkerBoxView>>();
const noBoxes: Record<string, ShulkerBoxView> = {};
const errors = new Map<string, PlayerError>();
const listeners = new Set<() => void>();
const nobody: Record<string, InventoryItem[]> = {};

const notify = () => listeners.forEach((listener) => listener());

export const readInventories = (server: string): Record<string, InventoryItem[]> => inventories.get(server) || nobody;
export const readEnderChests = (server: string): Record<string, InventoryItem[]> => enderChests.get(server) || nobody;
export const readShulkerBoxes = (server: string): Record<string, ShulkerBoxView> => shulkerBoxes.get(server) || noBoxes;
export const readPlayerError = (server: string): PlayerError | null => errors.get(server) || null;

export const handleInventoryMessage = (server: string, message: BridgeMessage) => {
    const parsed = parseInventory(message);
    if (!parsed) return;

    inventories.set(server, { ...readInventories(server), [parsed.name]: parsed.items });
    notify();
};

export const handleEnderChestMessage = (server: string, message: BridgeMessage) => {
    const parsed = parseEnderChest(message);
    if (!parsed) return;

    enderChests.set(server, { ...readEnderChests(server), [parsed.name]: parsed.items });
    notify();
};

export const handleShulkerBoxMessage = (server: string, message: BridgeMessage) => {
    const parsed = parseShulkerBox(message);
    if (!parsed) return;

    shulkerBoxes.set(server, { ...readShulkerBoxes(server), [parsed.name]: parsed.view });
    notify();
};

/** The plugin could not do what it was asked: the player is gone, or the item does not fit the slot. */
export const handlePlayerError = (server: string, message: BridgeMessage) => {
    if (message.event !== 'player-error') return;
    const player = toPlayer(message);
    if (!player || typeof message.error !== 'string' || typeof message.action !== 'string') return;

    errors.set(server, {
        name: player.name,
        action: message.action.slice(0, 20),
        error: message.error.slice(0, 120),
        at: Date.now(),
    });
    notify();
};

/** Nobody is online while the server is not running. */
export const clearInventories = (server: string) => {
    const had = [
        inventories.delete(server),
        enderChests.delete(server),
        shulkerBoxes.delete(server),
        errors.delete(server),
    ].some(Boolean);
    if (had) notify();
};

export const useInventory = (server: string, name: string | null): InventoryItem[] | null => {
    const [state, setState] = useState(readInventories(server));

    useEffect(() => {
        const update = () => setState(readInventories(server));
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, [server]);

    return name ? state[name] ?? null : null;
};

export const useEnderChest = (server: string, name: string | null): InventoryItem[] | null => {
    const [state, setState] = useState(readEnderChests(server));

    useEffect(() => {
        const update = () => setState(readEnderChests(server));
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, [server]);

    return name ? state[name] ?? null : null;
};

/** The last shulker box that was looked into for a player. Check where and box: it may be an older one. */
export const useShulkerBox = (server: string, name: string | null): ShulkerBoxView | null => {
    const [state, setState] = useState(readShulkerBoxes(server));

    useEffect(() => {
        const update = () => setState(readShulkerBoxes(server));
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, [server]);

    return name ? state[name] ?? null : null;
};

export const usePlayerError = (server: string): PlayerError | null => {
    const [state, setState] = useState(readPlayerError(server));

    useEffect(() => {
        const update = () => setState(readPlayerError(server));
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, [server]);

    return state;
};

// ---- commands ----------------------------------------------------------------------------------------------------------

const NAME = /^[A-Za-z0-9_.-]{1,32}$/;

export type PlayerCommand =
    | { action: 'inventory' | 'ender' | 'heal' | 'feed'; name: string }
    | { action: 'swap' | 'enderswap'; name: string; from: number; to: number }
    | { action: 'delete' | 'enderdelete'; name: string; slot: number }
    // A shulker box in the inventory or the ender chest: look into it, move items inside it, delete one from it.
    | { action: 'shulker'; name: string; where: BoxWhere; slot: number }
    | { action: 'shulkerswap'; name: string; where: BoxWhere; slot: number; from: number; to: number }
    | { action: 'shulkerdelete'; name: string; where: BoxWhere; slot: number; inner: number }
    // Adds to (or, negative, takes from) the health in hit points, the hunger bar or the experience level.
    | { action: 'health' | 'hunger' | 'levels'; name: string; delta: number }
    | { action: 'gamemode'; name: string; mode: string };

/** The console line for the plugin, null when anything in it is not valid (the name is typed into a console). */
export const playerCommandLine = (command: PlayerCommand): string | null => {
    if (!NAME.test(command.name)) return null;
    const ender = command.action === 'enderswap' || command.action === 'enderdelete';
    const slot = (n: number) => Number.isInteger(n) && n >= 0 && n < (ender ? ENDER_SLOT_COUNT : SLOT_COUNT);

    if (command.action === 'shulker' || command.action === 'shulkerswap' || command.action === 'shulkerdelete') {
        const parent = (n: number) =>
            Number.isInteger(n) && n >= 0 && n < (command.where === 'ender' ? ENDER_SLOT_COUNT : SLOT_COUNT);
        const inner = (n: number) => Number.isInteger(n) && n >= 0 && n < SHULKER_SLOT_COUNT;
        if ((command.where !== 'inv' && command.where !== 'ender') || !parent(command.slot)) return null;
        const head = `${BRIDGE_COMMAND} ${command.action} ${command.name} ${command.where} ${command.slot}`;

        if (command.action === 'shulker') return head;
        if (command.action === 'shulkerdelete') return inner(command.inner) ? `${head} ${command.inner}` : null;

        return inner(command.from) && inner(command.to) && command.from !== command.to
            ? `${head} ${command.from} ${command.to}`
            : null;
    }

    switch (command.action) {
        case 'swap':
        case 'enderswap':
            return slot(command.from) && slot(command.to) && command.from !== command.to
                ? `${BRIDGE_COMMAND} ${command.action} ${command.name} ${command.from} ${command.to}`
                : null;
        case 'delete':
        case 'enderdelete':
            return slot(command.slot) ? `${BRIDGE_COMMAND} ${command.action} ${command.name} ${command.slot}` : null;
        case 'gamemode':
            return ['survival', 'creative', 'adventure', 'spectator'].includes(command.mode)
                ? `${BRIDGE_COMMAND} gamemode ${command.name} ${command.mode}`
                : null;
        case 'health':
        case 'hunger':
        case 'levels':
            return Number.isInteger(command.delta) && command.delta !== 0 && Math.abs(command.delta) <= 1000
                ? `${BRIDGE_COMMAND} ${command.action} ${command.name} ${command.delta}`
                : null;
        default:
            return `${BRIDGE_COMMAND} ${command.action} ${command.name}`;
    }
};

// ---- how it is drawn ---------------------------------------------------------------------------------------------------

/**
 * Where the item of each slot is in the inventory picture (176 by 166 pixels), which is the one of the game: the armor in a
 * column on the left, the off hand next to it, the inventory in three rows and the hotbar under them. Every slot is 18
 * pixels with the item 1 pixel inside it.
 */
export const SLOT_POSITIONS: { slot: number; x: number; y: number }[] = [
    { slot: HELMET, x: 8, y: 8 },
    { slot: CHESTPLATE, x: 8, y: 26 },
    { slot: LEGGINGS, x: 8, y: 44 },
    { slot: BOOTS, x: 8, y: 62 },
    { slot: OFF_HAND, x: 77, y: 62 },
    ...Array.from({ length: 27 }, (_, i) => ({ slot: 9 + i, x: 8 + (i % 9) * 18, y: 84 + Math.floor(i / 9) * 18 })),
    ...Array.from({ length: 9 }, (_, i) => ({ slot: i, x: 8 + i * 18, y: 142 })),
];

/** The ender chest in its picture (176 by 118 pixels): 3 rows of 9, the items 1 pixel inside the slots. */
export const ENDER_POSITIONS: { slot: number; x: number; y: number }[] = Array.from(
    { length: ENDER_SLOT_COUNT },
    (_, i) => ({
        slot: i,
        x: 8 + (i % 9) * 18,
        y: 18 + Math.floor(i / 9) * 18,
    })
);

/** The inside of a shulker box has the same picture and places as the ender chest: 3 rows of 9. */
export const SHULKER_POSITIONS = ENDER_POSITIONS;

/** "diamond_sword" as "Diamond Sword". */
export const prettyItem = (id: string): string =>
    id
        .replace(/^[^:]*:/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

const ROMAN: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
];

/** The level of an enchantment as the game writes it, 5 as V. Levels over 255 are shown as numbers. */
export const roman = (level: number): string => {
    if (level < 1 || level > 255) return String(level);
    let rest = level;
    let out = '';
    ROMAN.forEach(([value, text]) => {
        while (rest >= value) {
            out += text;
            rest -= value;
        }
    });

    return out;
};

export const enchantmentLine = (id: string, level: number): string => `${prettyItem(id)} ${roman(level)}`;

/** How much of the durability is left, 0 to 1, undefined for an item that does not wear out. */
export const durabilityLeft = (item: InventoryItem): number | undefined =>
    item.maxDamage && item.damage !== undefined
        ? Math.max(0, Math.min(1, 1 - item.damage / item.maxDamage))
        : undefined;

/** The colour of the durability bar, from green through yellow to red the way the game does. */
export const durabilityColor = (left: number): string => `hsl(${Math.round(left * 120)}, 100%, 50%)`;

// The texture packs of the tools. The 1.21 ones come with them, the one of the newest version is taken from Mojang's own client
// when the tools are installed (tools/fetch-mc-textures.mjs), so a server on 26.x shows its own items and blocks.
const TEXTURE_VERSIONS = ['1.21.1', '1.21.5', '1.21.11'];
const NEWEST_TEXTURES = '26.3';

/** The pack to try when the one of a version is not there, null for a pack that is always there. */
export const fallbackTextureVersion = (version: string): string | null =>
    version === NEWEST_TEXTURES ? TEXTURE_VERSIONS[TEXTURE_VERSIONS.length - 1] : null;

/** The version of the textures closest to what the server runs, by minor and patch. 26.x and newer use the newest pack. */
export const textureVersion = (serverVersion: string | null | undefined): string => {
    const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec((serverVersion || '').trim());
    if (!match) return TEXTURE_VERSIONS[1];
    if (Number(match[1]) !== 1) return Number(match[1]) > 1 ? NEWEST_TEXTURES : TEXTURE_VERSIONS[1];

    const rank = (v: string) => {
        const m = /^1\.(\d+)(?:\.(\d+))?/.exec(v)!;

        return Number(m[1]) * 100 + Number(m[2] || 0);
    };
    const wanted = Number(match[2] || 0) * 100 + Number(match[3] || 0);

    // The older one wins a tie.
    return TEXTURE_VERSIONS.reduce((best, v) => {
        const distance = Math.abs(rank(v) - wanted);
        const bestDistance = Math.abs(rank(best) - wanted);

        return distance < bestDistance || (distance === bestDistance && rank(v) < rank(best)) ? v : best;
    }, TEXTURE_VERSIONS[0]);
};

// Items the game draws with the picture of another one, plus the shimmer.
const SAME_PICTURE: Record<string, string> = { enchanted_golden_apple: 'golden_apple' };

/** Items that shimmer like an enchanted one without being enchanted. */
export const alwaysShimmers = (id: string): boolean => id.replace(/^[^:]*:/, '') === 'enchanted_golden_apple';

/** The picture of an item that is one, such as a sword or an apple. Blocks have none, they are drawn (lib/blockIcon.ts). */
export const itemTextureUrl = (version: string, id: string, base = '/tools/mc-assets'): string => {
    const name = id.replace(/^[^:]*:/, '');

    return `${base}/${version}/items/${SAME_PICTURE[name] || name}.png`;
};

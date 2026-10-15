import {
    clearInventories,
    ENDER_POSITIONS,
    handleEnderChestMessage,
    parseEnderChest,
    readEnderChests,
    durabilityColor,
    durabilityLeft,
    enchantmentLine,
    handleInventoryMessage,
    handlePlayerError,
    parseInventory,
    parseItem,
    playerCommandLine,
    prettyItem,
    readInventories,
    readPlayerError,
    roman,
    SLOT_POSITIONS,
    alwaysShimmers,
    fallbackTextureVersion,
    itemTextureUrl,
    textureVersion,
} from '@/lib/inventory';

const sword = {
    slot: 0,
    id: 'minecraft:diamond_sword',
    count: 1,
    damage: 12,
    maxDamage: 1561,
    name: 'Excalibur',
    enchants: { sharpness: 5, fire_aspect: 2 },
};

describe('parseItem', () => {
    it('reads what the plugin sends', () => {
        expect(parseItem(sword)).toEqual(sword);
        expect(parseItem({ slot: 9, id: 'minecraft:stone', count: 64 })).toEqual({
            slot: 9,
            id: 'minecraft:stone',
            count: 64,
        });
    });

    it('refuses what is not an item', () => {
        expect(parseItem({ ...sword, slot: 41 })).toBeNull();
        expect(parseItem({ ...sword, slot: -1 })).toBeNull();
        expect(parseItem({ ...sword, count: 0 })).toBeNull();
        expect(parseItem({ ...sword, count: 100 })).toBeNull();
        expect(parseItem({ ...sword, id: 'diamond sword' })).toBeNull();
        expect(parseItem({ ...sword, id: '<script>' })).toBeNull();
        expect(parseItem(null)).toBeNull();
    });

    it('drops details that are wrong and keeps the item', () => {
        const item = parseItem({
            slot: 1,
            id: 'minecraft:stone',
            count: 1,
            damage: 5,
            enchants: { 'bad key!': 1, ok: 2, zero: 0 },
        })!;

        expect(item.damage).toBeUndefined();
        expect(item.enchants).toEqual({ ok: 2 });
    });
});

describe('parseInventory', () => {
    const uuid = '13bc7d5e-f906-41ff-a949-6c1eb677fe03';

    it('reads a player and the items, one per slot', () => {
        const parsed = parseInventory({
            event: 'inventory',
            name: 'Steve',
            uuid,
            items: [
                sword,
                { ...sword, id: 'minecraft:stone' },
                { slot: 3, id: 'minecraft:apple', count: 5 },
                { slot: 99 },
            ],
        });

        expect(parsed?.name).toBe('Steve');
        expect(parsed?.items.map((i) => i.slot)).toEqual([0, 3]);
        expect(parsed?.items[0].id).toBe('minecraft:diamond_sword');
    });

    it('refuses a player name that is not a name and other events', () => {
        expect(parseInventory({ event: 'inventory', name: 'bad name!', items: [] })).toBeNull();
        expect(parseInventory({ event: 'players', name: 'Steve', items: [] })).toBeNull();
        expect(parseInventory({ event: 'inventory', name: 'Steve' })).toBeNull();
    });
});

describe('the store', () => {
    it('keeps the inventory per player and server and forgets it', () => {
        handleInventoryMessage('s', { event: 'inventory', name: 'Steve', items: [sword] });
        handleInventoryMessage('s', { event: 'inventory', name: 'Alex', items: [] });
        handleInventoryMessage('s', { event: 'inventory', name: 'Steve', items: [] });

        expect(Object.keys(readInventories('s')).sort()).toEqual(['Alex', 'Steve']);
        expect(readInventories('s').Steve).toEqual([]);
        expect(readInventories('other')).toEqual({});

        handlePlayerError('s', {
            event: 'player-error',
            name: 'Steve',
            action: 'swap',
            error: 'That item can not go in that slot.',
        });
        expect(readPlayerError('s')).toMatchObject({ name: 'Steve', action: 'swap' });

        clearInventories('s');
        expect(readInventories('s')).toEqual({});
        expect(readPlayerError('s')).toBeNull();
    });

    it('ignores errors that are not well formed', () => {
        handlePlayerError('e', { event: 'player-error', name: 'bad name!', action: 'swap', error: 'x' });
        handlePlayerError('e', { event: 'player-error', name: 'Steve', action: 'swap' });

        expect(readPlayerError('e')).toBeNull();
    });
});

describe('the ender chest', () => {
    it('has 27 slots, and an item in a higher slot is refused', () => {
        const parsed = parseEnderChest({
            event: 'enderchest',
            name: 'Steve',
            items: [
                { slot: 26, id: 'minecraft:diamond', count: 3 },
                { slot: 27, id: 'minecraft:diamond', count: 1 },
                { slot: 0, id: 'minecraft:stone', count: 1 },
            ],
        });

        expect(parsed?.items.map((i) => i.slot)).toEqual([26, 0]);
        expect(parseEnderChest({ event: 'inventory', name: 'Steve', items: [] })).toBeNull();
    });

    it('is kept apart from the inventory and forgotten with it', () => {
        handleInventoryMessage('x', {
            event: 'inventory',
            name: 'Steve',
            items: [{ slot: 1, id: 'minecraft:stone', count: 1 }],
        });
        handleEnderChestMessage('x', {
            event: 'enderchest',
            name: 'Steve',
            items: [{ slot: 2, id: 'minecraft:diamond', count: 2 }],
        });

        expect(readInventories('x').Steve[0].id).toBe('minecraft:stone');
        expect(readEnderChests('x').Steve[0].id).toBe('minecraft:diamond');
        clearInventories('x');
        expect(readEnderChests('x')).toEqual({});
    });

    it('has the slots in the picture, 3 rows of 9', () => {
        expect(ENDER_POSITIONS).toHaveLength(27);
        expect(ENDER_POSITIONS[0]).toEqual({ slot: 0, x: 8, y: 18 });
        expect(ENDER_POSITIONS[8]).toEqual({ slot: 8, x: 152, y: 18 });
        expect(ENDER_POSITIONS[26]).toEqual({ slot: 26, x: 152, y: 54 });
    });

    it('builds the commands for it, with its own number of slots', () => {
        expect(playerCommandLine({ action: 'ender', name: 'Steve' })).toBe('stratpanelhidepanellogs ender Steve');
        expect(playerCommandLine({ action: 'enderswap', name: 'Steve', from: 0, to: 26 })).toBe(
            'stratpanelhidepanellogs enderswap Steve 0 26'
        );
        expect(playerCommandLine({ action: 'enderswap', name: 'Steve', from: 0, to: 27 })).toBeNull();
        expect(playerCommandLine({ action: 'enderdelete', name: 'Steve', slot: 26 })).toBe(
            'stratpanelhidepanellogs enderdelete Steve 26'
        );
        expect(playerCommandLine({ action: 'enderdelete', name: 'Steve', slot: 30 })).toBeNull();
        // The same slot is fine in the inventory.
        expect(playerCommandLine({ action: 'swap', name: 'Steve', from: 0, to: 30 })).toBe(
            'stratpanelhidepanellogs swap Steve 0 30'
        );
    });
});

describe('playerCommandLine', () => {
    it('builds the lines for the plugin', () => {
        expect(playerCommandLine({ action: 'inventory', name: 'Steve' })).toBe(
            'stratpanelhidepanellogs inventory Steve'
        );
        expect(playerCommandLine({ action: 'heal', name: 'Steve' })).toBe('stratpanelhidepanellogs heal Steve');
        expect(playerCommandLine({ action: 'swap', name: 'Steve', from: 3, to: 40 })).toBe(
            'stratpanelhidepanellogs swap Steve 3 40'
        );
        expect(playerCommandLine({ action: 'delete', name: '.Bedrock', slot: 0 })).toBe(
            'stratpanelhidepanellogs delete .Bedrock 0'
        );
    });

    it('builds nothing from a name or slot that is not valid', () => {
        expect(playerCommandLine({ action: 'heal', name: 'Steve; stop' })).toBeNull();
        expect(playerCommandLine({ action: 'heal', name: 'a b' })).toBeNull();
        expect(playerCommandLine({ action: 'swap', name: 'Steve', from: 1, to: 1 })).toBeNull();
        expect(playerCommandLine({ action: 'swap', name: 'Steve', from: -1, to: 2 })).toBeNull();
        expect(playerCommandLine({ action: 'swap', name: 'Steve', from: 1, to: 41 })).toBeNull();
        expect(playerCommandLine({ action: 'delete', name: 'Steve', slot: 1.5 })).toBeNull();
    });
});

describe('changing health, hunger and levels', () => {
    it('builds the line with a signed number', () => {
        expect(playerCommandLine({ action: 'levels', name: 'Steve', delta: 5 })).toBe(
            'stratpanelhidepanellogs levels Steve 5'
        );
        expect(playerCommandLine({ action: 'levels', name: 'Steve', delta: -1 })).toBe(
            'stratpanelhidepanellogs levels Steve -1'
        );
        expect(playerCommandLine({ action: 'health', name: 'Steve', delta: -2 })).toBe(
            'stratpanelhidepanellogs health Steve -2'
        );
        expect(playerCommandLine({ action: 'hunger', name: '.Bedrock', delta: 2 })).toBe(
            'stratpanelhidepanellogs hunger .Bedrock 2'
        );
    });

    it('builds nothing from a number that is not a sensible whole number', () => {
        expect(playerCommandLine({ action: 'levels', name: 'Steve', delta: 0 })).toBeNull();
        expect(playerCommandLine({ action: 'levels', name: 'Steve', delta: 1.5 })).toBeNull();
        expect(playerCommandLine({ action: 'levels', name: 'Steve', delta: 5000 })).toBeNull();
        expect(playerCommandLine({ action: 'health', name: 'Steve', delta: NaN })).toBeNull();
        expect(playerCommandLine({ action: 'health', name: 'Steve; stop', delta: 2 })).toBeNull();
    });
});

describe('changing the game mode', () => {
    it('builds the line for the four modes and nothing else', () => {
        expect(playerCommandLine({ action: 'gamemode', name: 'Steve', mode: 'creative' })).toBe(
            'stratpanelhidepanellogs gamemode Steve creative'
        );
        expect(playerCommandLine({ action: 'gamemode', name: 'Steve', mode: 'spectator' })).toBe(
            'stratpanelhidepanellogs gamemode Steve spectator'
        );
        expect(playerCommandLine({ action: 'gamemode', name: 'Steve', mode: 'hardcore' })).toBeNull();
        expect(playerCommandLine({ action: 'gamemode', name: 'Steve; stop', mode: 'survival' })).toBeNull();
    });
});

describe('SLOT_POSITIONS', () => {
    it('has every slot once, inside the picture, and the slots of the game where the picture has them', () => {
        const slots = SLOT_POSITIONS.map((p) => p.slot).sort((a, b) => a - b);

        expect(slots).toEqual(Array.from({ length: 41 }, (_, i) => i));
        SLOT_POSITIONS.forEach((p) => {
            expect(p.x + 16).toBeLessThanOrEqual(176);
            expect(p.y + 16).toBeLessThanOrEqual(166);
        });
        const at = (slot: number) => SLOT_POSITIONS.find((p) => p.slot === slot)!;
        expect(at(39)).toMatchObject({ x: 8, y: 8 });
        expect(at(36)).toMatchObject({ x: 8, y: 62 });
        expect(at(40)).toMatchObject({ x: 77, y: 62 });
        expect(at(9)).toMatchObject({ x: 8, y: 84 });
        expect(at(35)).toMatchObject({ x: 152, y: 120 });
        expect(at(0)).toMatchObject({ x: 8, y: 142 });
        expect(at(8)).toMatchObject({ x: 152, y: 142 });
    });
});

describe('names and numbers', () => {
    it('writes items and enchantments like the game', () => {
        expect(prettyItem('minecraft:diamond_sword')).toBe('Diamond Sword');
        expect(roman(1)).toBe('I');
        expect(roman(4)).toBe('IV');
        expect(roman(5)).toBe('V');
        expect(roman(9)).toBe('IX');
        expect(roman(255)).toBe('CCLV');
        expect(roman(1000)).toBe('1000');
        expect(enchantmentLine('fire_aspect', 2)).toBe('Fire Aspect II');
    });

    it('works out the durability that is left', () => {
        expect(durabilityLeft(sword)).toBeCloseTo(0.992, 2);
        expect(durabilityLeft({ slot: 0, id: 'minecraft:stone', count: 1 })).toBeUndefined();
        expect(durabilityLeft({ slot: 0, id: 'minecraft:x', count: 1, damage: 5000, maxDamage: 100 })).toBe(0);
        expect(durabilityColor(1)).toBe('hsl(120, 100%, 50%)');
        expect(durabilityColor(0)).toBe('hsl(0, 100%, 50%)');
    });
});

describe('textures', () => {
    it('picks the nearest version of the textures', () => {
        expect(textureVersion('1.21.4')).toBe('1.21.5');
        expect(textureVersion('1.21.1')).toBe('1.21.1');
        expect(textureVersion('1.20.4')).toBe('1.21.1');
        expect(textureVersion('1.21.11')).toBe('1.21.11');
        expect(textureVersion('26.3')).toBe('26.3');
        expect(textureVersion('26.1')).toBe('26.3');
        expect(textureVersion('26.4')).toBe('26.3');
        expect(textureVersion(null)).toBe('1.21.5');
    });

    it('has an older pack to fall back to for the newest one only', () => {
        expect(fallbackTextureVersion('26.3')).toBe('1.21.11');
        expect(fallbackTextureVersion('1.21.5')).toBeNull();
    });

    it('has the picture of an item in the items of the textures', () => {
        expect(itemTextureUrl('1.21.5', 'minecraft:diamond_sword')).toBe(
            '/tools/mc-assets/1.21.5/items/diamond_sword.png'
        );
        expect(itemTextureUrl('1.21.1', 'mod:ruby', '/x')).toBe('/x/1.21.1/items/ruby.png');
        expect(itemTextureUrl('1.21.5', 'minecraft:enchanted_golden_apple')).toBe(
            '/tools/mc-assets/1.21.5/items/golden_apple.png'
        );
        expect(alwaysShimmers('minecraft:enchanted_golden_apple')).toBe(true);
        expect(alwaysShimmers('minecraft:golden_apple')).toBe(false);
    });
});

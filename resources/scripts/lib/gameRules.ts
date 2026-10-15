/**
 * The game rules of a dimension, from its data/minecraft/game_rules.dat (26.x worlds). The file is an NBT compound with
 * the rules under "data" as "minecraft:<name>": a byte for a switch, an int for a number, and a DataVersion beside it.
 * Rules this panel does not know are listed too, and rules of a type it cannot edit are left exactly as they are.
 */
import { getTag, NbtFile, Tag, withTag } from '@/lib/nbt';

export type RuleGroup =
    | 'Players'
    | 'Mobs and spawning'
    | 'Drops and explosions'
    | 'World'
    | 'Commands and chat'
    | 'Other';

export const RULE_GROUPS: RuleGroup[] = [
    'Players',
    'Mobs and spawning',
    'Drops and explosions',
    'World',
    'Commands and chat',
    'Other',
];

interface Known {
    group: RuleGroup;
    label?: string;
    description: string;
}

const known: Record<string, Known> = {
    pvp: { group: 'Players', description: 'Players can hurt each other.' },
    keep_inventory: { group: 'Players', description: 'Players keep their items and experience when they die.' },
    immediate_respawn: { group: 'Players', description: 'Players respawn at once, without the death screen.' },
    fall_damage: { group: 'Players', description: 'Players take damage from falling.' },
    fire_damage: { group: 'Players', description: 'Players take damage from fire and lava.' },
    drowning_damage: { group: 'Players', description: 'Players take damage from drowning.' },
    freeze_damage: { group: 'Players', description: 'Players take damage from powder snow.' },
    natural_health_regeneration: {
        group: 'Players',
        description: 'Players heal by themselves when they are not hungry.',
    },
    players_sleeping_percentage: {
        group: 'Players',
        description: 'The percentage of players who have to sleep for the night to pass.',
    },
    player_movement_check: { group: 'Players', description: 'The server checks that players do not move too fast.' },
    elytra_movement_check: { group: 'Players', description: 'The server checks that elytra do not fly too fast.' },
    forgive_dead_players: { group: 'Players', description: 'Angered mobs calm down when the player they hunt dies.' },
    universal_anger: {
        group: 'Players',
        description: 'Angered mobs attack every player, not only the one they are angry with.',
    },
    locator_bar: { group: 'Players', description: 'Shows where other players are on the experience bar.' },
    respawn_radius: { group: 'Players', description: 'How many blocks around the spawn point players can respawn.' },
    spectators_generate_chunks: { group: 'Players', description: 'Spectators make the server generate new chunks.' },
    ender_pearls_vanish_on_death: {
        group: 'Players',
        description: 'Thrown ender pearls disappear when their thrower dies.',
    },
    limited_crafting: { group: 'Players', description: 'Players can only craft recipes they have unlocked.' },
    players_nether_portal_default_delay: {
        group: 'Players',
        description: 'Ticks a player waits in a Nether portal, in survival.',
    },
    players_nether_portal_creative_delay: {
        group: 'Players',
        description: 'Ticks a player waits in a Nether portal, in creative.',
    },
    allow_entering_nether_using_portals: {
        group: 'Players',
        description: 'Nether portals take players to the Nether.',
    },

    spawn_monsters: { group: 'Mobs and spawning', description: 'Hostile mobs spawn naturally.' },
    spawn_mobs: { group: 'Mobs and spawning', description: 'Mobs spawn naturally.' },
    spawn_phantoms: { group: 'Mobs and spawning', description: 'Phantoms spawn for players who do not sleep.' },
    spawn_patrols: { group: 'Mobs and spawning', description: 'Pillager patrols spawn.' },
    spawn_wardens: { group: 'Mobs and spawning', description: 'Wardens spawn near sculk shriekers.' },
    spawn_wandering_traders: { group: 'Mobs and spawning', description: 'Wandering traders spawn.' },
    raids: { group: 'Mobs and spawning', description: 'Raids start when a player with Bad Omen enters a village.' },
    mob_griefing: { group: 'Mobs and spawning', description: 'Mobs can change blocks, like creepers and endermen.' },
    max_entity_cramming: {
        group: 'Mobs and spawning',
        description: 'How many entities fit in one block before they take damage, 0 for no limit.',
    },

    block_drops: { group: 'Drops and explosions', description: 'Broken blocks drop items.' },
    mob_drops: { group: 'Drops and explosions', description: 'Mobs drop items when they die.' },
    entity_drops: { group: 'Drops and explosions', description: 'Other entities, like minecarts, drop items.' },
    block_explosion_drop_decay: {
        group: 'Drops and explosions',
        description: 'Some blocks destroyed by a block explosion drop nothing.',
    },
    mob_explosion_drop_decay: {
        group: 'Drops and explosions',
        description: 'Some blocks destroyed by a mob explosion drop nothing.',
    },
    tnt_explosion_drop_decay: {
        group: 'Drops and explosions',
        description: 'Some blocks destroyed by TNT drop nothing.',
    },
    tnt_explodes: { group: 'Drops and explosions', description: 'TNT explodes when it is lit.' },

    advance_time: { group: 'World', description: 'The time of day moves on.' },
    advance_weather: { group: 'World', description: 'The weather changes.' },
    random_tick_speed: { group: 'World', description: 'How fast crops grow and leaves decay, the game default is 3.' },
    fire_spread_radius_around_player: {
        group: 'World',
        description: 'Fire only spreads this close to a player, a negative number for everywhere.',
    },
    spread_vines: { group: 'World', description: 'Vines spread.' },
    water_source_conversion: { group: 'World', description: 'Flowing water between two sources becomes a source.' },
    lava_source_conversion: {
        group: 'World',
        description: 'Flowing lava next to water and a source becomes a source.',
    },
    max_snow_accumulation_height: { group: 'World', description: 'The most layers of snow that pile up.' },
    spawner_blocks_work: { group: 'World', description: 'Spawners spawn mobs.' },
    projectiles_can_break_blocks: { group: 'World', description: 'Projectiles can break blocks like decorated pots.' },

    command_blocks_work: { group: 'Commands and chat', description: 'Command blocks run their commands.' },
    command_block_output: { group: 'Commands and chat', description: 'Command blocks show what they did in chat.' },
    send_command_feedback: {
        group: 'Commands and chat',
        description: 'Players see the result of the commands they run.',
    },
    log_admin_commands: { group: 'Commands and chat', description: 'Admin commands are written to the log.' },
    show_death_messages: { group: 'Commands and chat', description: 'Deaths are announced in chat.' },
    show_advancement_messages: { group: 'Commands and chat', description: 'Advancements are announced in chat.' },
    reduced_debug_info: {
        group: 'Commands and chat',
        description: 'The debug screen hides coordinates and other details.',
    },
    global_sound_events: {
        group: 'Commands and chat',
        description: 'Sounds like the Wither spawning are heard everywhere.',
    },
    max_command_sequence_length: {
        group: 'Commands and chat',
        description: 'The most commands a function can run in one go.',
    },
    max_command_forks: { group: 'Commands and chat', description: 'The most contexts a command can fork into.' },
    max_block_modifications: { group: 'Commands and chat', description: 'The most blocks one command can change.' },
};

export interface Rule {
    // The full key, "minecraft:pvp".
    key: string;
    // "pvp".
    id: string;
    label: string;
    description: string;
    group: RuleGroup;
    kind: 'boolean' | 'integer';
    value: boolean | number;
}

const pretty = (id: string) => {
    const words = id.replace(/[_-]+/g, ' ').trim();

    return words.charAt(0).toUpperCase() + words.slice(1);
};

const idOf = (key: string) => key.replace(/^[^:]*:/, '');

/** The rules of the file that can be edited here: the switches and the numbers, in the order of the file. */
export const readGameRules = (file: NbtFile): { rules: Rule[]; dataVersion: number | null } => {
    const data = getTag(file.root, 'data');
    const version = getTag(file.root, 'DataVersion');
    const rules: Rule[] = [];

    if (data && data.t === 10) {
        data.v.forEach((tag, key) => {
            if (tag.t !== 1 && tag.t !== 3) return;
            const id = idOf(key);
            const info = known[id];
            rules.push({
                key,
                id,
                label: info?.label || pretty(id),
                description: info?.description || '',
                group: info?.group || 'Other',
                kind: tag.t === 1 ? 'boolean' : 'integer',
                value: tag.t === 1 ? tag.v !== 0 : tag.v,
            });
        });
    }

    return { rules, dataVersion: version && version.t === 3 ? version.v : null };
};

/** A copy of the file with one rule changed. A switch stays a byte and a number stays an int. */
export const setGameRule = (file: NbtFile, key: string, value: boolean | number): NbtFile => {
    const current = getTag(file.root, 'data', key);
    if (!current || (current.t !== 1 && current.t !== 3)) throw new Error(`${key} is not a rule that can be changed.`);

    let tag: Tag;
    if (current.t === 1) {
        if (typeof value !== 'boolean') throw new Error(`${key} is a switch.`);
        tag = { t: 1, v: value ? 1 : 0 };
    } else {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
            throw new Error(`${key} needs a whole number.`);
        }
        tag = { t: 3, v: value };
    }

    return { name: file.name, root: withTag(file.root, ['data', key], tag) };
};

/** Parses what somebody typed into a number field, null when it is not a whole number the game can store. */
export const parseRuleNumber = (text: string): number | null => {
    if (!/^-?\d+$/.test(text.trim())) return null;
    const value = Number(text.trim());

    return value >= -2147483648 && value <= 2147483647 ? value : null;
};

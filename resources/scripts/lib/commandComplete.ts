/**
 * Tab completion for the console command line: a small grammar of the vanilla and Paper commands (and their
 * sub commands) that is turned into a tree, plus the function that walks it for the text typed so far.
 *
 * Pattern syntax, one token per word:
 *   a|b|c         literal words (aliases or sub commands)
 *   <name>        a free value that cannot be completed, shown as a hint
 *   <name:type>   a value with suggestions taken from TYPES
 *   *root / *exec jump back to the start of a command / of an "execute" chain, which allows recursion
 */

export const TYPES: Record<string, string[]> = {
    sel: ['@a', '@e', '@p', '@r', '@s', '@n'],
    // Names of players, filled in with whoever is online when completing.
    player: [],
    pos: ['~', '^'],
    bool: ['true', 'false'],
    gm: ['survival', 'creative', 'adventure', 'spectator'],
    diff: ['peaceful', 'easy', 'normal', 'hard'],
    weather: ['clear', 'rain', 'thunder'],
    dim: ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'],
    effect: (
        'speed slowness haste mining_fatigue strength instant_health instant_damage jump_boost nausea regeneration ' +
        'resistance fire_resistance water_breathing invisibility blindness night_vision hunger weakness poison wither ' +
        'health_boost absorption saturation glowing levitation luck unluck slow_falling conduit_power dolphins_grace ' +
        'bad_omen hero_of_the_village darkness trial_omen raid_omen wind_charged weaving oozing infested'
    ).split(' '),
    ench: (
        'protection fire_protection feather_falling blast_protection projectile_protection respiration aqua_affinity ' +
        'thorns depth_strider frost_walker binding_curse soul_speed swift_sneak sharpness smite bane_of_arthropods ' +
        'knockback fire_aspect looting sweeping_edge efficiency silk_touch unbreaking fortune power punch flame ' +
        'infinity luck_of_the_sea lure loyalty impaling riptide channeling multishot quick_charge piercing density ' +
        'breach wind_burst mending vanishing_curse'
    ).split(' '),
    rule: (
        'announceAdvancements blockExplosionDropDecay commandBlockOutput disableElytraMovementCheck disableRaids ' +
        'doDaylightCycle doEntityDrops doFireTick doImmediateRespawn doInsomnia doLimitedCrafting doMobLoot ' +
        'doMobSpawning doPatrolSpawning doTileDrops doTraderSpawning doVinesSpread doWardenSpawning doWeatherCycle ' +
        'drowningDamage enderPearlsVanishOnDeath fallDamage fireDamage forgiveDeadPlayers freezeDamage ' +
        'globalSoundEvents keepInventory lavaSourceConversion logAdminCommands maxCommandChainLength ' +
        'maxEntityCramming mobExplosionDropDecay mobGriefing naturalRegeneration playersNetherPortalCreativeDelay ' +
        'playersNetherPortalDefaultDelay playersSleepingPercentage projectilesCanBreakBlocks randomTickSpeed ' +
        'reducedDebugInfo sendCommandFeedback showDeathMessages snowAccumulationHeight spawnChunkRadius spawnRadius ' +
        'spectatorsGenerateChunks tntExplodes tntExplosionDropDecay universalAnger waterSourceConversion'
    ).split(' '),
    color: (
        'black dark_blue dark_green dark_aqua dark_red dark_purple gold gray dark_gray blue green aqua red ' +
        'light_purple yellow white reset'
    ).split(' '),
};

export const PATTERNS: string[] = [
    // Vanilla
    'advancement grant|revoke <targets:sel> only|from|until|through|everything',
    'attribute <target:sel> <attribute> get|base|modifier',
    'attribute <target:sel> <attribute> base get|set|reset',
    'attribute <target:sel> <attribute> modifier add|remove|value',
    'ban <targets:sel> <reason>',
    'ban-ip <target> <reason>',
    'banlist ips|players',
    'bossbar add|get|list|remove|set <id>',
    'bossbar get <id> max|players|value|visible',
    'bossbar set <id> color|max|name|players|style|value|visible',
    'bossbar set <id> color blue|green|pink|purple|red|white|yellow',
    'bossbar set <id> style notched_6|notched_10|notched_12|notched_20|progress',
    'bossbar set <id> visible <value:bool>',
    'clear <targets:sel> <item> <count>',
    'clone <x1:pos> <y1:pos> <z1:pos> <x2:pos> <y2:pos> <z2:pos> <x:pos> <y:pos> <z:pos> replace|masked|filtered',
    'damage <target:sel> <amount> <type>',
    'data get|merge|modify|remove block|entity|storage',
    'data modify block|entity|storage <target> <path> append|insert|merge|prepend|set',
    'data modify block|entity|storage <target> <path> append|insert|merge|prepend|set from|string|value',
    'datapack disable|enable|list|create <name>',
    'datapack list available|enabled',
    'datapack enable <name> first|last|before|after',
    'debug start|stop|function',
    'defaultgamemode <mode:gm>',
    'deop|op <targets:sel>',
    'difficulty <difficulty:diff>',
    'effect give <targets:sel> <effect:effect> <seconds> <amplifier> <hideParticles:bool>',
    'effect clear <targets:sel> <effect:effect>',
    'enchant <targets:sel> <enchantment:ench> <level>',
    'experience|xp add|set <targets:sel> <amount> points|levels',
    'experience|xp query <targets:sel> points|levels',
    'fill <x1:pos> <y1:pos> <z1:pos> <x2:pos> <y2:pos> <z2:pos> <block> destroy|hollow|keep|outline|replace',
    'fillbiome <x1:pos> <y1:pos> <z1:pos> <x2:pos> <y2:pos> <z2:pos> <biome> replace',
    'forceload add|query|remove <x> <z>',
    'forceload remove all',
    'function <name> with|<arguments>',
    'gamemode <mode:gm> <target:sel>',
    'gamerule <rule:rule> <value:bool>',
    'give <targets:sel> <item> <count>',
    'help <command>',
    'item replace|modify block|entity <target>',
    'item replace entity <targets:sel> <slot> with|from',
    'item modify entity <targets:sel> <slot> <modifier>',
    'jfr start|stop',
    'kick <targets:sel> <reason>',
    'kill <targets:sel>',
    'list uuids',
    'locate structure|biome|poi <name>',
    'loot give|insert|replace|spawn <target>',
    'loot give <players:sel> fish|kill|loot|mine',
    'me <action>',
    'msg|tell|w <targets:sel> <message>',
    'particle <name> <x:pos> <y:pos> <z:pos> <dx> <dy> <dz> <speed> <count> force|normal',
    'perf start|stop',
    'place feature|jigsaw|structure|template <name> <x:pos> <y:pos> <z:pos>',
    'playsound <sound> master|music|record|weather|block|hostile|neutral|player|ambient|voice <targets:sel>',
    'publish <allowCommands:bool> <gamemode:gm> <port>',
    'random value|roll|reset <range>',
    'recipe give|take <targets:sel> *',
    'reload',
    'return <value>|fail|run',
    'return run *root',
    'ride <target:sel> mount|dismount',
    'save-all flush',
    'save-off',
    'save-on',
    'say <message>',
    'schedule function|clear <name>',
    'schedule function <name> <time> append|replace',
    'scoreboard objectives|players',
    'scoreboard objectives add|list|modify|remove|setdisplay <objective>',
    'scoreboard objectives add <objective> dummy|trigger|health|food|air|armor|level|xp',
    'scoreboard objectives modify <objective> displayname|rendertype|numberformat',
    'scoreboard objectives modify <objective> rendertype hearts|integer',
    'scoreboard objectives setdisplay list|sidebar|below_name <objective>',
    'scoreboard players add|enable|get|list|operation|remove|reset|set <targets:sel> <objective>',
    'scoreboard players operation <targets:sel> <objective> +=|-=|*=|/=|%=|=|<|>|>< <source:sel> <sourceObjective>',
    'seed',
    'setblock <x:pos> <y:pos> <z:pos> <block> destroy|keep|replace',
    'setidletimeout <minutes>',
    'setworldspawn <x:pos> <y:pos> <z:pos> <angle>',
    'spawnpoint <targets:sel> <x:pos> <y:pos> <z:pos> <angle>',
    'spectate <target:sel> <player:sel>',
    'spreadplayers <x> <z> <spreadDistance> <maxRange> <respectTeams:bool> <targets:sel>',
    'stop',
    'stopsound <targets:sel> master|music|record|weather|block|hostile|neutral|player|ambient|voice',
    'summon <entity> <x:pos> <y:pos> <z:pos> <nbt>',
    'tag <targets:sel> add|list|remove <name>',
    'team add|empty|join|leave|list|modify|remove <team>',
    'team join <team> <members:sel>',
    'team modify <team> collisionRule|color|displayName|friendlyFire|nametagVisibility|deathMessageVisibility|prefix|seeFriendlyInvisibles|suffix',
    'team modify <team> collisionRule always|never|pushOtherTeams|pushOwnTeam',
    'team modify <team> color <value:color>',
    'team modify <team> friendlyFire|seeFriendlyInvisibles <value:bool>',
    'team modify <team> nametagVisibility|deathMessageVisibility always|never|hideForOtherTeams|hideForOwnTeam',
    'teammsg|tm <message>',
    'teleport|tp <destination:sel>',
    'teleport|tp <targets:sel> <destination:sel>',
    'teleport|tp <targets:sel> <x:pos> <y:pos> <z:pos> <yaw> <pitch> facing',
    'teleport|tp <x:pos> <y:pos> <z:pos>',
    'tellraw <targets:sel> <message>',
    'tick query|rate|freeze|unfreeze|step|sprint',
    'tick step|sprint stop',
    'time set|add|query',
    'time set day|night|noon|midnight|<time>',
    'time query daytime|gametime|day',
    'title <targets:sel> clear|reset|title|subtitle|actionbar|times',
    'transfer <hostname> <port> <players:sel>',
    'trigger <objective> add|set',
    'weather clear|rain|thunder <duration>',
    'whitelist add|remove <player:player>',
    'whitelist list|off|on|reload',
    'worldborder add|center|damage|get|set|warning',
    'worldborder damage amount|buffer <value>',
    'worldborder warning distance|time <value>',

    // execute can chain: every sub command ends by jumping back to the chain, "run" starts a new command.
    'execute as|at|positioned|rotated|facing|align|anchored|in|on|summon|if|unless|store|run',
    'execute as|at <targets:sel> *exec',
    'execute positioned <x:pos> <y:pos> <z:pos> *exec',
    'execute positioned as|over <targets:sel> *exec',
    'execute rotated <yaw> <pitch> *exec',
    'execute rotated as <targets:sel> *exec',
    'execute facing <x:pos> <y:pos> <z:pos> *exec',
    'execute facing entity <targets:sel> eyes|feet *exec',
    'execute align <axes> *exec',
    'execute anchored eyes|feet *exec',
    'execute in <dimension:dim> *exec',
    'execute on attacker|controller|leasher|origin|owner|passengers|target|vehicle *exec',
    'execute summon <entity> *exec',
    'execute if|unless block|blocks|biome|data|dimension|entity|function|items|loaded|predicate|score',
    'execute if|unless entity <targets:sel> *exec',
    'execute if|unless dimension <dimension:dim> *exec',
    'execute if|unless block <x:pos> <y:pos> <z:pos> <block> *exec',
    'execute if|unless score <targets:sel> <objective> =|<|<=|>|>=|matches <value> *exec',
    'execute store result|success block|bossbar|entity|score|storage <target> *exec',
    'execute store result|success score <targets:sel> <objective> *exec',
    'execute run *root',

    // Paper / Bukkit
    'plugins|pl',
    'version|ver|about|icanhasbukkit <plugin>',
    'reload confirm',
    'tps',
    'mspt',
    'restart',
    'timings on|off|paste|reset|report|verbose|separate|merged',
    'paper version|reload|mobcaps|playermobcaps|dumpitem|syncloadinfo|entity|chunkinfo|fixlight|dumplisteners|heap',
    'paper entity list <filter>',
    'paper mobcaps|playermobcaps <world>',
    'paper chunkinfo <world> <x> <z>',

    // Velocity
    'velocity version|plugins|reload|dump|heap',
    'glist all',
    'server <name>',
    'send <player> <server>',
    'shutdown',
    'end',
];

export interface Node {
    lit: Map<string, Node>;
    arg: Map<string, Node>;
    links: Node[];
    // A fixed list of values to suggest for an argument, from a plugin that knows them.
    suggestions?: string[];
    description?: string;
}

export const node = (): Node => ({ lit: new Map(), arg: new Map(), links: [] });

const child = (parent: Node, map: 'lit' | 'arg', key: string): Node => {
    const found = parent[map].get(key);
    if (found) return found;

    const created = node();
    parent[map].set(key, created);

    return created;
};

export const buildTree = (patterns: string[]): Node => {
    const root = node();
    const exec = child(root, 'lit', 'execute');

    patterns.forEach((pattern) => {
        let nodes: Node[] = [root];
        pattern.split(' ').forEach((token) => {
            if (token === '*root') return nodes.forEach((n) => n.links.push(root));
            if (token === '*exec') return nodes.forEach((n) => n.links.push(exec));

            if (token.startsWith('<')) {
                const key = token.slice(1, -1);
                nodes = nodes.map((n) => child(n, 'arg', key));
                return;
            }

            nodes = nodes.flatMap((n) => token.split('|').map((word) => child(n, 'lit', word)));
        });
    });

    return root;
};

export const BUILT_IN_TREE = buildTree(PATTERNS);

/** A node plus everything reachable through jumps. */
const expand = (nodes: Node[]): Node[] => {
    const seen = new Set<Node>();
    const visit = (n: Node) => {
        if (seen.has(n)) return;
        seen.add(n);
        n.links.forEach(visit);
    };
    nodes.forEach(visit);

    return [...seen];
};

export interface Completion {
    // Index in the input where the word being completed starts.
    start: number;
    items: string[];
    // The name of the next value when there is nothing to suggest for it, e.g. "message".
    hint: string | null;
    // What a plugin says about some of the items, shown as a tooltip.
    descriptions?: Record<string, string>;
}

export const complete = (input: string, tree: Node = BUILT_IN_TREE, players: string[] = []): Completion => {
    const text = input.startsWith('/') ? input.slice(1) : input;
    const offset = input.length - text.length;
    const words = text.split(' ');
    const partial = words[words.length - 1];
    const start = offset + text.length - partial.length;

    let nodes = expand([tree]);
    for (const word of words.slice(0, -1)) {
        const next: Node[] = [];
        nodes.forEach((n) => {
            const match = n.lit.get(word);
            if (match) next.push(match);
            n.arg.forEach((value) => next.push(value));
        });
        nodes = expand(next);
        if (nodes.length === 0) return { start, items: [], hint: null };
    }

    const wanted = partial.toLowerCase();
    const items: string[] = [];
    let hint: string | null = null;
    const add = (value: string) => {
        if (value.toLowerCase().startsWith(wanted) && value !== partial && !items.includes(value)) items.push(value);
    };

    const descriptions: Record<string, string> = {};
    nodes.forEach((n) => {
        n.lit.forEach((child, word) => {
            add(word);
            if (child.description) descriptions[word] = child.description;
        });
        n.arg.forEach((child, key) => {
            const [name, type] = key.split(':');
            let suggested = false;
            if (type && TYPES[type]) {
                // Whoever is online comes first, a selector is rarely what is wanted when a name is being typed.
                if (type === 'sel' || type === 'player') players.forEach(add);
                TYPES[type].forEach(add);
                suggested = true;
            }
            if (child.suggestions?.length) {
                child.suggestions.forEach(add);
                suggested = true;
            }
            if (!suggested && !hint) hint = name;
        });
    });

    // Only the items that are shown need their description.
    Object.keys(descriptions).forEach((word) => {
        if (!items.includes(word)) delete descriptions[word];
    });

    return { start, items, hint: items.length ? null : hint, descriptions };
};

/** The longest text every candidate starts with, used by Tab to complete as far as is unambiguous. */
export const commonPrefix = (items: string[]): string =>
    items.reduce((prefix, item) => {
        let i = 0;
        while (i < prefix.length && i < item.length && prefix[i].toLowerCase() === item[i].toLowerCase()) i++;

        return prefix.slice(0, i);
    }, items[0] || '');

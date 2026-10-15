/**
 * Health, hunger and experience of the players who are online, from the "vitals" message of the Stratosphere plugin
 * (protocol 3, the game mode came with 7):
 *   {"event":"vitals","players":[{"name":"Steve","uuid":"…","health":18,"maxHealth":20,"absorption":0,"food":17,
 *   "saturation":5.2,"level":12,"exp":0.33,"gameMode":"survival"}]}
 * Only messages that passed the trust check of the bridge are handed to this.
 */
import { useEffect, useState } from 'react';
import { BridgeMessage, toPlayer } from '@/lib/bridge';

export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator';
export const GAME_MODES: { id: GameMode; label: string }[] = [
    { id: 'survival', label: 'Survival' },
    { id: 'creative', label: 'Creative' },
    { id: 'adventure', label: 'Adventure' },
    { id: 'spectator', label: 'Spectator' },
];

export interface Vitals {
    health: number;
    maxHealth: number;
    absorption: number;
    // The hunger bar, 0 to 20.
    food: number;
    // What keeps the hunger bar from falling, never more than food.
    saturation: number;
    level: number;
    // Progress to the next level, 0 to 1.
    exp: number;
    // Null from a plugin that does not tell.
    gameMode: GameMode | null;
}

/** How often the panel asks while somebody has the player list open. */
export const VITALS_POLL_MS = 3000;

const num = (value: unknown, min: number, max: number): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;

/** The numbers of one player, null when any of them is missing or out of range. */
export const parseVitals = (value: unknown): Vitals | null => {
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    const health = num(v.health, 0, 2048);
    const maxHealth = num(v.maxHealth, 1, 2048);
    const absorption = num(v.absorption ?? 0, 0, 2048);
    const food = num(v.food, 0, 20);
    const saturation = num(v.saturation, 0, 20);
    const level = num(v.level ?? 0, 0, 1000000);
    const exp = num(v.exp ?? 0, 0, 1);
    if ([health, maxHealth, absorption, food, saturation, level, exp].some((n) => n === null)) return null;

    return {
        health: health!,
        maxHealth: maxHealth!,
        absorption: absorption!,
        food: Math.round(food!),
        saturation: Math.min(saturation!, food!),
        level: Math.floor(level!),
        exp: exp!,
        gameMode: GAME_MODES.find((mode) => mode.id === v.gameMode)?.id ?? null,
    };
};

export type Icon = 'full' | 'half' | 'empty';

/**
 * The hearts left to right, as the game draws them: ten hearts for 20 hit points, one more for each 2 above that. The game
 * rounds the health up, so 18.2 is 10 hearts minus one.
 */
export const heartIcons = (health: number, maxHealth: number): Icon[] => {
    const shown = Math.ceil(health);

    return Array.from({ length: Math.max(1, Math.ceil(maxHealth / 2)) }, (_, index) =>
        shown >= index * 2 + 2 ? 'full' : shown === index * 2 + 1 ? 'half' : 'empty'
    );
};

/** The ten drumsticks, the first one being the rightmost: the hunger bar is emptied from the left. */
export const foodIcons = (food: number): Icon[] =>
    Array.from({ length: 10 }, (_, index) =>
        food >= index * 2 + 2 ? 'full' : food === index * 2 + 1 ? 'half' : 'empty'
    );

/** How many drumsticks (from the right) the saturation covers, one for every 2 points. */
export const saturatedIcons = (saturation: number): number => Math.min(10, Math.ceil(saturation / 2));

// ---- the store ---------------------------------------------------------------------------------------------------------

const states = new Map<string, Record<string, Vitals>>();
const listeners = new Set<() => void>();
const empty: Record<string, Vitals> = {};

export const readVitals = (server: string): Record<string, Vitals> => states.get(server) || empty;

const notify = () => listeners.forEach((listener) => listener());

/** Replaces what is known: a player who is not in the message is not online any more. */
export const handleVitalsMessage = (server: string, message: BridgeMessage) => {
    if (message.event !== 'vitals' || !Array.isArray(message.players)) return;

    const next: Record<string, Vitals> = {};
    message.players.forEach((entry) => {
        const player = toPlayer(entry);
        const vitals = parseVitals(entry);
        if (player && vitals) next[player.name] = vitals;
    });
    states.set(server, next);
    notify();
};

export const clearVitals = (server: string) => {
    if (states.delete(server)) notify();
};

export const useVitals = (server: string): Record<string, Vitals> => {
    const [state, setState] = useState(readVitals(server));

    useEffect(() => {
        const update = () => setState(readVitals(server));
        listeners.add(update);
        update();

        return () => {
            listeners.delete(update);
        };
    }, [server]);

    return state;
};

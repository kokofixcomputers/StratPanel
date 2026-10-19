/**
 * The language of the search box: "restart my survival server", "create a backup called weekly for lobby", "dark mode". The work is done by
 * public/js/stratosphere-nlu.js (a small trained classifier and some rules, made by tools/train-nlu.js), which the admin pages use as well.
 * This only gives it types.
 */

export interface NluServer {
    uuid: string;
    id: string;
    name: string;
}

export interface NluContext {
    servers: NluServer[];
    // The server that is open, when one is.
    current: NluServer | null;
}

export type NluIntent =
    | 'start'
    | 'stop'
    | 'restart'
    | 'kill'
    | 'backup'
    | 'command'
    | 'page'
    | 'open'
    | 'site'
    | 'theme';

export interface Interpretation {
    intent: NluIntent;
    confidence: number;
    // The servers it may be about: one, or a few that fit equally well. Empty for the theme and for pages of the site.
    servers: NluServer[];
    usedCurrent: boolean;
    signal?: 'start' | 'stop' | 'restart' | 'kill';
    // The name asked for a backup, '' when none.
    backupName?: string;
    command?: string;
    page?: { path: string; name: string };
    site?: { path: string; name: string };
    mode?: 'dark' | 'light' | 'toggle';
}

interface Engine {
    interpret: (query: string, context: NluContext) => Interpretation | null;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const engine: Engine = require('../../../public/js/stratosphere-nlu.js');

/** What the person means, or null when it is not a request. */
export const interpret = <S extends NluServer>(
    query: string,
    context: { servers: S[]; current: S | null }
): (Interpretation & { servers: S[] }) | null =>
    engine.interpret(query, context) as (Interpretation & { servers: S[] }) | null;

/** A few things to try, with the names of servers the person has. */
export const exampleQueries = (names: string[]): string[] => {
    const a = names[0] || 'survival';
    const b = names[1] || names[0] || 'lobby';
    const c = names[2] || names[0] || 'skyblock';

    return [
        `restart ${a}`,
        `create a backup called weekly for ${b}`,
        `turn off ${c}`,
        `open the files of ${a}`,
        `run say hello on ${b}`,
        'dark mode',
        `start my minecraft server ${c}`,
        `back up ${a} and name it before update`,
    ];
};

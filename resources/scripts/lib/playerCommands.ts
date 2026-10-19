/** The commands behind the buttons of the player window. Names come from the server; what a person types is made safe here. */

export const MAX_TEXT = 200;

/** One line without control characters: a newline in a reason would otherwise end the command and start another. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]+/g;

export const oneLine = (text: string): string =>
    text.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

/** A player name the server could have: letters, digits, underscore and dots (Bedrock names through Geyser) of up to 32. */
export const validName = (name: string): boolean => /^[A-Za-z0-9_.]{1,32}$/.test(name);

export const kickCommand = (name: string, reason: string): string | null =>
    validName(name) ? `kick ${name}${oneLine(reason) ? ` ${oneLine(reason)}` : ''}` : null;

export const banCommand = (name: string, reason: string): string | null =>
    validName(name) ? `ban ${name}${oneLine(reason) ? ` ${oneLine(reason)}` : ''}` : null;

/** A private message, which needs one. */
export const whisperCommand = (name: string, message: string): string | null =>
    validName(name) && oneLine(message) ? `msg ${name} ${oneLine(message)}` : null;

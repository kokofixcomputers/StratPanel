/** Colours spread over a run of characters, for the gradient button of the MOTD editor. */
const channels = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);

    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (r: number, g: number, b: number) =>
    '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** `count` colours that run through all the stops evenly. */
export const interpolateColors = (stops: string[], count: number): string[] => {
    if (!stops.length || count <= 0) return [];
    if (stops.length === 1) return Array(count).fill(stops[0]);
    if (count === 1) return [stops[0]];

    return Array.from({ length: count }, (_, i) => {
        const position = (i / (count - 1)) * (stops.length - 1);
        const index = Math.min(Math.floor(position), stops.length - 2);
        const t = position - index;
        const a = channels(stops[index]);
        const b = channels(stops[index + 1]);

        return toHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    });
};

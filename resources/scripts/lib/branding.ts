/**
 * What an admin sets under Settings > Branding, as the page gets it in window.SiteConfiguration.
 */
export type AnnouncementType = 'info' | 'success' | 'warning' | 'danger';
export type LinkLocation = 'sidebar' | 'navbar' | 'footer';

export type Place = 'dashboard' | 'server' | 'account';
export const PLACES: { id: Place; label: string }[] = [
    { id: 'dashboard', label: 'The dashboard' },
    { id: 'server', label: 'Inside a server' },
    { id: 'account', label: 'Account settings' },
];

/** What decides whether somebody sees an announcement or a card of links: where they are, and what servers they have. */
export interface Audience {
    where: Place[];
    // They need a server of one of these eggs, of one of these software (VANILLA, PAPER...), on one of these nodes. Empty asks for nothing.
    eggs: number[];
    software: string[];
    nodes: string[];
}

export interface Announcement extends Audience {
    id: string;
    // Changes whenever the announcement is edited, which is what brings back one that somebody dismissed.
    key: string;
    title: string;
    message: string;
    type: AnnouncementType;
    dismissible: boolean;
    linkLabel: string;
    linkUrl: string;
}

export interface CustomLink {
    label: string;
    url: string;
    location: LinkLocation;
    newTab: boolean;
}

export type CardStyle = 'list' | 'cards' | 'grid';

export interface LinkCardLink {
    label: string;
    url: string;
    icon: string;
    newTab: boolean;
}

/** A card of links on the dashboard, "Need a hand?" with a link to Discord and one to support. */
export interface LinkCard {
    where: Place[];
    id: string;
    title: string;
    position: 'top' | 'bottom';
    style: CardStyle;
    links: LinkCardLink[];
}

export interface Branding {
    favicon: string | null;
    // The start of the panel's own lines in a server console.
    consolePrompt: string;
    announcements: Announcement[];
    links: CustomLink[];
    linkCards: LinkCard[];
}

/** The icon of the panel when an admin has not uploaded another one: the same picture as the default favicon. */
export const DEFAULT_LOGO = '/favicons/android-chrome-192x192.png';

/** The picture for the logo spots of the panel (top bar, sign in page): the favicon an admin uploaded, or the default. */
export const logoUrl = (favicon: string | null | undefined): string => favicon || DEFAULT_LOGO;

export const DEFAULT_CONSOLE_PROMPT = 'container@stratosphere~';

export const EMPTY_BRANDING: Branding = {
    favicon: null,
    consolePrompt: DEFAULT_CONSOLE_PROMPT,
    announcements: [],
    links: [],
    linkCards: [],
};

/** Only a link to another site or to a page of the panel is followed, never javascript: or data:. */
export const isSafeUrl = (url: string): boolean => /^(https?:\/\/|\/(?!\/))\S+$/i.test(url.trim());

const parseAudience = (raw: any): Audience => {
    const where = (Array.isArray(raw?.where) ? raw.where : []).filter((p: any) =>
        PLACES.some((place) => place.id === p)
    );

    return {
        where: where.length > 0 ? where : ['dashboard'],
        eggs: (Array.isArray(raw?.eggs) ? raw.eggs : [])
            .map(Number)
            .filter((n: number) => Number.isInteger(n) && n > 0),
        software: (Array.isArray(raw?.software) ? raw.software : []).map(String),
        nodes: (Array.isArray(raw?.nodes) ? raw.nodes : []).map(String),
    };
};

/** The server sends snake_case, the panel works with camelCase. Anything missing falls back to nothing. */
export const parseBranding = (raw: any): Branding => {
    if (!raw || typeof raw !== 'object') return EMPTY_BRANDING;

    return {
        favicon: typeof raw.favicon === 'string' && raw.favicon ? raw.favicon : null,
        consolePrompt:
            typeof raw.console_prompt === 'string' && raw.console_prompt.trim()
                ? raw.console_prompt.trim()
                : DEFAULT_CONSOLE_PROMPT,
        announcements: (Array.isArray(raw.announcements) ? raw.announcements : [])
            .filter((a: any) => a && typeof a.message === 'string' && a.message)
            .map((a: any) => ({
                id: String(a.id || ''),
                key: String(a.key || a.id || ''),
                title: String(a.title || ''),
                message: String(a.message),
                type: ['info', 'success', 'warning', 'danger'].includes(a.type) ? a.type : 'info',
                dismissible: a.dismissible !== false,
                linkLabel: String(a.link_label || ''),
                linkUrl: String(a.link_url || ''),
                ...parseAudience(a),
            })),
        linkCards: (Array.isArray(raw.link_cards) ? raw.link_cards : [])
            .filter((c: any) => c && c.enabled !== false)
            .map((c: any) => ({
                id: String(c.id || ''),
                title: String(c.title || ''),
                position: c.position === 'top' ? 'top' : 'bottom',
                where: parseAudience(c).where,
                style: ['list', 'cards', 'grid'].includes(c.style) ? c.style : 'cards',
                links: (Array.isArray(c.links) ? c.links : [])
                    .filter((l: any) => l && l.label && l.url && isSafeUrl(String(l.url)))
                    .map((l: any) => ({
                        label: String(l.label),
                        url: String(l.url),
                        icon: String(l.icon || 'link'),
                        newTab: l.newTab !== undefined ? !!l.newTab : l.new_tab !== false,
                    })),
            }))
            .filter((c: LinkCard) => c.links.length > 0),
        links: (Array.isArray(raw.links) ? raw.links : [])
            .filter((l: any) => l && l.label && l.url)
            .map((l: any) => ({
                label: String(l.label),
                url: String(l.url),
                location: ['sidebar', 'navbar', 'footer'].includes(l.location) ? l.location : 'footer',
                newTab: l.newTab !== undefined ? !!l.newTab : l.new_tab !== false,
            })),
    };
};

export const linksAt = (links: CustomLink[], location: LinkLocation): CustomLink[] =>
    links.filter((link) => link.location === location && isSafeUrl(link.url));

/** The servers a person has, as far as the conditions need to know. `null` while they are not known yet. */
export interface Holdings {
    servers: { uuid: string; eggId: number; node: string }[] | null;
    // The software of a server (VANILLA, PAPER...) when it was found out, null when not.
    software: (uuid: string) => string | null;
}

/** Whether something with this audience is for somebody who is in this place and has these servers. All the conditions have to hold, any one of a list is enough. */
export const appliesTo = (audience: Audience, place: Place, holdings: Holdings): boolean => {
    if (!audience.where.includes(place)) return false;
    const needsServers = audience.eggs.length > 0 || audience.software.length > 0 || audience.nodes.length > 0;
    if (!needsServers) return true;
    // Before the servers are known nothing that asks for one is shown, it would flash on and off.
    if (!holdings.servers) return false;

    const has = (test: (s: { uuid: string; eggId: number; node: string }) => boolean) => holdings.servers!.some(test);

    return (
        (audience.eggs.length === 0 || has((s) => audience.eggs.includes(s.eggId))) &&
        (audience.nodes.length === 0 || has((s) => audience.nodes.includes(s.node))) &&
        (audience.software.length === 0 || has((s) => audience.software.includes(holdings.software(s.uuid) ?? '')))
    );
};

export const visibleAnnouncements = (list: Announcement[], dismissed: string[]): Announcement[] =>
    list.filter((a) => !(a.dismissible && dismissed.includes(a.key)));

/**
 * What an admin sets under Settings > Branding, as the page gets it in window.SiteConfiguration.
 */
export type AnnouncementType = 'info' | 'success' | 'warning' | 'danger';
export type LinkLocation = 'sidebar' | 'navbar' | 'footer';

export interface Announcement {
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

export interface Branding {
    favicon: string | null;
    announcements: Announcement[];
    links: CustomLink[];
}

/** The icon of the panel when an admin has not uploaded another one: the same picture as the default favicon. */
export const DEFAULT_LOGO = '/favicons/android-chrome-192x192.png';

/** The picture for the logo spots of the panel (top bar, sign in page): the favicon an admin uploaded, or the default. */
export const logoUrl = (favicon: string | null | undefined): string => favicon || DEFAULT_LOGO;

export const EMPTY_BRANDING: Branding = { favicon: null, announcements: [], links: [] };

/** The server sends snake_case, the panel works with camelCase. Anything missing falls back to nothing. */
export const parseBranding = (raw: any): Branding => {
    if (!raw || typeof raw !== 'object') return EMPTY_BRANDING;

    return {
        favicon: typeof raw.favicon === 'string' && raw.favicon ? raw.favicon : null,
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
            })),
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

/** Only a link to another site or to a page of the panel is followed, never javascript: or data:. */
export const isSafeUrl = (url: string): boolean => /^(https?:\/\/|\/(?!\/))\S+$/i.test(url.trim());

export const linksAt = (links: CustomLink[], location: LinkLocation): CustomLink[] =>
    links.filter((link) => link.location === location && isSafeUrl(link.url));

export const visibleAnnouncements = (list: Announcement[], dismissed: string[]): Announcement[] =>
    list.filter((a) => !(a.dismissible && dismissed.includes(a.key)));

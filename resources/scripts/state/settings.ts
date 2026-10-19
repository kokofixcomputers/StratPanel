import { action, Action } from 'easy-peasy';

export interface SiteSettings {
    name: string;
    locale: string;
    // The time zone of the panel, which schedules run by.
    timezone?: string;
    // What the admin set under Settings > Branding, as the server sends it (see parseBranding).
    branding?: unknown;
    // The browser part of the extensions that are on, see lib/extensions.ts.
    extensions?: import('@/lib/extensions').ExtensionInfo[];
    recaptcha: {
        enabled: boolean;
        siteKey: string;
    };
    // The captcha on the forms, chosen under Settings > Authentication.
    captcha?: {
        provider: 'none' | 'recaptcha' | 'turnstile';
        siteKey: string;
    };
    auth?: {
        // Whether the sign up page can be used at all.
        registration: boolean;
        // Whether it has the username and password form.
        passwordRegistration: boolean;
        // Whether passkeys can be used.
        passkeys: boolean;
        providers: AuthProviderInfo[];
    };
}

export interface AuthProviderInfo {
    key: string;
    name: string;
    type: string;
    // Whether somebody without an account can sign up with it.
    signup: boolean;
}

export interface SettingsStore {
    data?: SiteSettings;
    setSettings: Action<SettingsStore, SiteSettings>;
}

const settings: SettingsStore = {
    data: undefined,

    setSettings: action((state, payload) => {
        state.data = payload;
    }),
};

export default settings;

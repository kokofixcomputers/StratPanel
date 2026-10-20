/**
 * "Hide sensitive information": for streaming, a screen share or a screenshot. While it is on, what could point at a person or a server
 * (IP addresses, the addresses of servers and domains, email addresses) is shown as dots instead. It only changes what is shown: copying a
 * value still copies the real one, and nothing is changed on the panel. It is a setting of the browser (off by default), so a streaming
 * computer can have it on without the others noticing, and it follows between tabs.
 */
import { useEffect, useState } from 'react';

export const PRIVACY_KEY = 'stratosphere:privacy';
export const PRIVACY_EVENT = 'stratosphere:privacychange';

export const privacyOn = (): boolean => {
    try {
        return window.localStorage.getItem(PRIVACY_KEY) === '1';
    } catch (e) {
        return false;
    }
};

export const setPrivacy = (on: boolean): void => {
    try {
        window.localStorage.setItem(PRIVACY_KEY, on ? '1' : '0');
    } catch (e) {
        // Not kept (private window), it still holds until the page is reloaded.
        (window as any).__privacy = on;
    }
    window.dispatchEvent(new Event(PRIVACY_EVENT));
};

/** Whether it is on, and a way to change it. Every component that uses this changes at once, in every tab. */
export const usePrivacy = (): [boolean, (on: boolean) => void] => {
    const [on, setOn] = useState(() => privacyOn() || !!(window as any).__privacy);

    useEffect(() => {
        const update = () => setOn(privacyOn() || !!(window as any).__privacy);
        const onStorage = (e: StorageEvent) => e.key === PRIVACY_KEY && update();
        window.addEventListener(PRIVACY_EVENT, update);
        window.addEventListener('storage', onStorage);

        return () => {
            window.removeEventListener(PRIVACY_EVENT, update);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    return [on, setPrivacy];
};

const DOTS = '••••';

/**
 * A value as dots, keeping what it is made of (the dots and colons of an address, the @ of an email) so it still reads as the kind of thing it
 * is: "play.example.com:25565" is "••••.••••.••••:••••". Always the same length of dots, so the length of a name does not leak.
 */
export const censor = (value: string): string => value.replace(/[A-Za-z0-9_\-+%]+/g, DOTS);

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Four groups of hexadecimal or more (a time of day has two colons, an IPv6 address at least four groups), or one with "::".
const IPV6 = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b|\b(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}\b)?/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** The IP addresses and email addresses in a text, as dots: for lines of a log and the like, where the rest of the text stays. */
export const censorText = (text: string): string =>
    text.replace(EMAIL, '••••@••••.••••').replace(IPV4, '•••.•••.•••.•••').replace(IPV6, '••••:••••:••••');

// Keys of data (the details of an activity entry, say) whose value is always what is hidden.
const SENSITIVE_KEYS =
    /^(ip|ip_address|ipaddress|email|e-mail|address|host|hostname|domain|remote_address|allocation|connection_string)$/i;

/** A copy of any data with the sensitive keys hidden and addresses in the other text hidden too. */
export const censorDeep = (value: unknown, key = ''): any => {
    if (typeof value === 'string') return SENSITIVE_KEYS.test(key) ? censor(value) : censorText(value);
    if (Array.isArray(value)) return value.map((v) => censorDeep(v, key));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, censorDeep(v, k)])
        );
    }

    return value;
};

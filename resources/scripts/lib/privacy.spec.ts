/** @jest-environment jsdom */
import { censor, censorDeep, censorText, privacyOn, PRIVACY_KEY, setPrivacy } from '@/lib/privacy';

describe('censor', () => {
    it('keeps the shape of an address and loses what it says', () => {
        expect(censor('play.example.com:25565')).toBe('••••.••••.••••:••••');
        expect(censor('10.0.0.5')).toBe('••••.••••.••••.••••');
        expect(censor('steve@example.com')).toBe('••••@••••.••••');
        expect(censor('sftp://steve.1a2b3c4d@node-1.example.com:2022')).toBe('••••://••••.••••@••••.••••.••••:••••');
        expect(censor('')).toBe('');
    });

    it('does not let the length of a name show', () => {
        expect(censor('a')).toBe(censor('averyveryverylongname'));
    });
});

describe('censorText', () => {
    it('hides the addresses in a line of a log and leaves the rest', () => {
        expect(censorText('Steve[/203.0.113.42:51234] logged in with entity id 12 at (0.0, 64.0, 0.0)')).toBe(
            'Steve[/•••.•••.•••.•••:51234] logged in with entity id 12 at (0.0, 64.0, 0.0)'
        );
        expect(censorText('[12:30:45] [Server thread/INFO]: Done (3.4s)')).toBe(
            '[12:30:45] [Server thread/INFO]: Done (3.4s)'
        );
        expect(censorText('contact steve@example.com or 10.1.2.3')).toBe('contact ••••@••••.•••• or •••.•••.•••.•••');
        expect(censorText('from 2001:db8:85a3:0:0:8a2e:370:7334 now')).toBe('from ••••:••••:•••• now');
        expect(censorText('from fe80::1 now')).toBe('from ••••:••••:•••• now');
    });

    it('does not touch version numbers and coordinates that are not addresses', () => {
        expect(censorText('Minecraft 1.21.4 at 120 64 -300')).toBe('Minecraft 1.21.4 at 120 64 -300');
        expect(censorText('took 5.123s')).toBe('took 5.123s');
    });
});

describe('censorDeep', () => {
    it('hides the keys that hold an address, and addresses in other text', () => {
        const activity = {
            ip: '203.0.113.9',
            email: 'a@b.com',
            count: 3,
            name: 'world',
            nested: { host: 'play.example.com', note: 'from 10.0.0.1' },
            list: ['x@y.org', 'plain'],
            empty: null,
        };
        expect(censorDeep(activity)).toEqual({
            ip: '••••.••••.••••.••••',
            email: '••••@••••.••••',
            count: 3,
            name: 'world',
            nested: { host: '••••.••••.••••', note: 'from •••.•••.•••.•••' },
            list: ['••••@••••.••••', 'plain'],
            empty: null,
        });
    });
});

describe('the setting', () => {
    beforeEach(() => window.localStorage.clear());

    it('is off until somebody turns it on', () => {
        expect(privacyOn()).toBe(false);
        setPrivacy(true);
        expect(window.localStorage.getItem(PRIVACY_KEY)).toBe('1');
        expect(privacyOn()).toBe(true);
        setPrivacy(false);
        expect(privacyOn()).toBe(false);
    });

    it('tells the page when it changes', () => {
        const seen = jest.fn();
        window.addEventListener('stratosphere:privacychange', seen);
        setPrivacy(true);
        window.removeEventListener('stratosphere:privacychange', seen);

        expect(seen).toHaveBeenCalledTimes(1);
    });
});

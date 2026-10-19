import { anyPending, cleanLabel, httpsSummary, validLabel } from '@/lib/domainHttps';
import { DomainHttps } from '@/api/server/domains';

const https = (patch: Partial<DomainHttps> = {}): DomainHttps => ({
    web: true,
    status: 'none',
    message: null,
    coveredBy: null,
    expiresAt: null,
    source: null,
    canRequest: true,
    canRequestDns: true,
    renewByDns: false,
    dns: null,
    reason: null,
    ...patch,
});

describe('lib/domainHttps', () => {
    const now = new Date('2026-10-20T12:00:00Z');

    it('says nothing is served when it is not', () => {
        expect(httpsSummary(https({ web: false }))).toBe('Not served as a website.');
    });

    it('says what is going on', () => {
        expect(httpsSummary(https({ status: 'pending' }))).toContain('Getting a certificate');
        expect(httpsSummary(https({ status: 'failed', message: 'Timeout during connect' }))).toBe(
            'No certificate: Timeout during connect'
        );
        expect(httpsSummary(https({ status: 'failed' }))).toBe('Getting a certificate failed.');
        expect(httpsSummary(https())).toContain('Served over http');
        expect(
            httpsSummary(https({ status: 'pending', dns: { name: '_acme-challenge.a.b.c', value: 'x' } }))
        ).toContain('TXT record');
    });

    it('says how long a certificate lasts and where it is from', () => {
        const ends = (days: number) => new Date(now.getTime() + days * 86400000 + 1000);

        expect(
            httpsSummary(https({ status: 'issued', coveredBy: 'x', source: 'letsencrypt', expiresAt: ends(60) }), now)
        ).toBe("https works. Free certificate from Let's Encrypt, 60 days left.");
        expect(
            httpsSummary(https({ status: 'issued', coveredBy: 'Wildcard', source: 'manual', expiresAt: ends(1) }), now)
        ).toBe('https works. Certificate Wildcard, 1 day left.');
        expect(
            httpsSummary(
                https({
                    status: 'issued',
                    coveredBy: 'Wildcard',
                    source: 'manual',
                    expiresAt: new Date(now.getTime() - 5000),
                }),
                now
            )
        ).toContain('ends today');
        expect(httpsSummary(https({ status: 'issued', coveredBy: 'Wildcard' }), now)).toBe(
            'https works. Certificate Wildcard.'
        );
    });

    it('knows when something is pending', () => {
        expect(anyPending([{ https: https() }, { https: https({ status: 'pending' }) }])).toBe(true);
        expect(anyPending([{ https: https({ status: 'issued' }) }])).toBe(false);
        expect(anyPending([])).toBe(false);
    });
});

describe('cleanLabel and validLabel', () => {
    it('keeps what a name can hold', () => {
        expect(cleanLabel('Play Now!')).toBe('playnow');
        expect(cleanLabel('my-server.example.com')).toBe('my-serverexamplecom');
        expect(cleanLabel('a'.repeat(80))).toHaveLength(63);
    });

    it('knows a name from a typo', () => {
        expect(validLabel('play')).toBe(true);
        expect(validLabel('play-2')).toBe(true);
        expect(validLabel('a')).toBe(true);
        expect(validLabel('-play')).toBe(false);
        expect(validLabel('play-')).toBe(false);
        expect(validLabel('')).toBe(false);
    });
});

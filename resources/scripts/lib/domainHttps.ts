import { DomainHttps } from '@/api/server/domains';

/** A sentence for the state of the https of a domain, for under its name. */
export const httpsSummary = (https: DomainHttps, now: Date = new Date()): string => {
    if (!https.web) return 'Not served as a website.';
    if (https.status === 'pending' && https.dns) return 'Waiting for the TXT record below to show up...';
    if (https.status === 'pending') return "Getting a certificate from Let's Encrypt...";
    if (https.status === 'failed')
        return https.message ? `No certificate: ${https.message}` : 'Getting a certificate failed.';
    if (https.status === 'issued' && https.coveredBy) {
        const days = https.expiresAt ? Math.floor((https.expiresAt.getTime() - now.getTime()) / 86400000) : null;
        const owner =
            https.source === 'letsencrypt' ? "Free certificate from Let's Encrypt" : `Certificate ${https.coveredBy}`;

        return days === null
            ? `https works. ${owner}.`
            : `https works. ${owner}, ${days <= 0 ? 'ends today' : `${days} ${days === 1 ? 'day' : 'days'} left`}.`;
    }

    return 'Served over http. Get a certificate to serve it over https as well.';
};

/** Whether anything is being requested, the page looks again every few seconds while so. */
export const anyPending = (domains: { https: DomainHttps }[]): boolean =>
    domains.some((d) => d.https.status === 'pending');

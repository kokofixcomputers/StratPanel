<?php

namespace Pterodactyl\Services\Acme;

/**
 * Whatever gets a certificate from a certificate authority for a domain. Let's Encrypt in production, something that makes one up in
 * the tests.
 */
interface AcmeIssuer
{
    /**
     * @return array{chain: string, key: string} the certificate with the intermediate certificates after it, and its private key (PEM)
     *
     * @throws \Throwable with a reason that is fit to show to the person who asked
     */
    public function obtain(string $domain): array;

    /**
     * The same with the dns challenge, for a domain that Let's Encrypt can not visit (a private address, say): a TXT record proves it.
     *
     * @param  callable(string, string): void  $present  is called with the name and the value of the TXT record to add, and returns once
     *                                                   the record is there (or throws when it never shows up)
     * @return array{chain: string, key: string}
     *
     * @throws \Throwable with a reason that is fit to show to the person who asked
     */
    public function obtainDns(string $domain, callable $present): array;

    /**
     * One certificate for several names (a domain and its wildcard), all proven with the dns challenge. The names of a wildcard start with
     * "*.". The callable is called once for each name, with its own TXT record.
     *
     * @param  list<string>  $names
     * @param  callable(string, string): void  $present
     * @return array{chain: string, key: string}
     *
     * @throws \Throwable with a reason that is fit to show to the person who asked
     */
    public function obtainDnsNames(array $names, callable $present): array;
}

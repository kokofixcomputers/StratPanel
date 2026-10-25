<?php

namespace Pterodactyl\Services\Acme;

use Pterodactyl\Models\AcmeChallenge;
use skoerfgen\ACMECert\ACME_Exception;

/**
 * Gets a certificate from Let's Encrypt with the http-01 challenge: Let's Encrypt asks the domain over http (port 80, which panel-edge
 * answers by passing it to the panel) for a token the panel put in the database, and when it gets the right answer it signs.
 */
class LetsEncryptIssuer implements AcmeIssuer
{
    public function __construct(private AcmeAccount $account)
    {
    }

    public function obtain(string $domain): array
    {
        try {
            $client = $this->account->client();
            // A key for this certificate alone, an elliptic curve one: small and fast, every browser takes it.
            $key = $client->generateECKey('P-256');

            $chain = $client->getCertificateChain($key, [$domain => ['challenge' => 'http-01']], function (array $challenge) {
                AcmeChallenge::publish($challenge['key'], $challenge['value']);

                return fn (array $done) => AcmeChallenge::forget($done['key']);
            });
        } catch (ACME_Exception $exception) {
            // What Let's Encrypt says is for people ("Timeout during connect", "rate limit"), nothing secret.
            throw new \RuntimeException($exception->getMessage(), 0, $exception);
        }

        return ['chain' => $chain, 'key' => $key];
    }

    public function obtainDns(string $domain, callable $present): array
    {
        return $this->obtainDnsNames([$domain], $present);
    }

    public function obtainDnsNames(array $names, callable $present): array
    {
        try {
            $client = $this->account->client();
            $key = $client->generateECKey('P-256');

            $config = [];
            foreach ($names as $name) {
                $config[$name] = ['challenge' => 'dns-01'];
            }

            $chain = $client->getCertificateChain($key, $config, function (array $challenge) use ($present) {
                // The library waits for this call: it asks Let's Encrypt to look only after it returns.
                $present($challenge['key'], $challenge['value']);

                return null;
            });
        } catch (ACME_Exception $exception) {
            throw new \RuntimeException($exception->getMessage(), 0, $exception);
        }

        return ['chain' => $chain, 'key' => $key];
    }
}

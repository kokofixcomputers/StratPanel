<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use Pterodactyl\Services\Acme\AcmeIssuer;

/** A certificate authority that gives anybody a certificate, for the tests. */
class FakeAcmeIssuer implements AcmeIssuer
{
    use MakesCertificates;

    /** @var list<string> */
    public array $asked = [];

    public ?string $fail = null;

    public int $days = 90;

    /** @var list<array{name: string, value: string}> */
    public array $presented = [];

    public function obtainDns(string $domain, callable $present): array
    {
        $this->asked[] = $domain . ' (dns)';
        if ($this->fail !== null) {
            throw new \RuntimeException($this->fail);
        }
        $name = '_acme-challenge.' . $domain;
        $value = 'txt-value-for-' . $domain;
        $this->presented[] = ['name' => $name, 'value' => $value];
        $present($name, $value);

        return $this->made($domain);
    }

    public function obtain(string $domain): array
    {
        $this->asked[] = $domain;
        if ($this->fail !== null) {
            throw new \RuntimeException($this->fail);
        }

        return $this->made($domain);
    }

    private function made(string $domain): array
    {
        $chain = $this->makeChain([$domain], $this->days);
        $leaf = $chain['leaf'];

        return ['chain' => $leaf['certPem'] . "\n" . $chain['ca']['certPem'], 'key' => $leaf['keyPem']];
    }
}

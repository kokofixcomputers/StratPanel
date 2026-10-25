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

    public function obtainDnsNames(array $names, callable $present): array
    {
        $this->asked[] = implode(' + ', $names) . ' (dns)';
        if ($this->fail !== null) {
            throw new \RuntimeException($this->fail);
        }
        foreach ($names as $name) {
            $record = '_acme-challenge.' . ltrim($name, '*.');
            $value = 'txt-value-for-' . $name;
            $this->presented[] = ['name' => $record, 'value' => $value];
            $present($record, $value);
        }

        return $this->madeFor($names);
    }

    public function obtain(string $domain): array
    {
        $this->asked[] = $domain;
        if ($this->fail !== null) {
            throw new \RuntimeException($this->fail);
        }

        return $this->made($domain);
    }

    /** @param list<string> $names */
    private function madeFor(array $names): array
    {
        $chain = $this->makeChain($names, $this->days);

        return ['chain' => $chain['leaf']['certPem'] . "\n" . $chain['ca']['certPem'], 'key' => $chain['leaf']['keyPem']];
    }

    private function made(string $domain): array
    {
        $chain = $this->makeChain([$domain], $this->days);
        $leaf = $chain['leaf'];

        return ['chain' => $leaf['certPem'] . "\n" . $chain['ca']['certPem'], 'key' => $leaf['keyPem']];
    }
}

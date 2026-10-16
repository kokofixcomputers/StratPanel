<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use GuzzleHttp\Exception\TransferException;
use Illuminate\Http\Response;
use Psr\Http\Message\ResponseInterface;
use Pterodactyl\Models\Node;
use Pterodactyl\Repositories\Wings\DaemonCertificateRepository;
use Pterodactyl\Repositories\Wings\DaemonConfigurationRepository;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;

/** A Wings that takes certificates, for the tests. */
class FakeNodeWings extends DaemonCertificateRepository
{
    /** @var list<array{node: int, key: string, verify: bool, certificate: string}> */
    public array $pushes = [];

    public bool $failVerified = false;

    public bool $failUnverified = false;

    public bool $httpsWorks = true;

    public ?array $live = ['present' => false];

    public ?string $liveError = null;

    public function __construct()
    {
    }

    public function setNode(Node $node): self
    {
        $this->node = $node;

        return $this;
    }

    public function info(): array
    {
        if ($this->liveError !== null) {
            throw new DaemonConnectionException(new TransferException($this->liveError));
        }

        return $this->live ?? ['present' => false];
    }

    public function push(string $certificate, string $key, bool $verify): array
    {
        if (($verify && $this->failVerified) || (!$verify && $this->failUnverified)) {
            throw new DaemonConnectionException(new TransferException($verify ? 'certificate verify failed' : 'connection refused'));
        }
        $this->pushes[] = ['node' => $this->node->id, 'key' => $key, 'verify' => $verify, 'certificate' => $certificate];

        return ['present' => true];
    }

    public function reachableOverHttps(): bool
    {
        return $this->httpsWorks;
    }
}

class FakeNodeConfiguration extends DaemonConfigurationRepository
{
    /** @var list<array{id: int, scheme: string}> */
    public array $updates = [];

    public bool $fail = false;

    public function __construct()
    {
    }

    public function setNode(Node $node): self
    {
        $this->node = $node;

        return $this;
    }

    public function update(Node $node): ResponseInterface
    {
        if ($this->fail) {
            throw new DaemonConnectionException(new TransferException('down'));
        }
        $this->updates[] = ['id' => $node->id, 'scheme' => $node->scheme];

        return new \GuzzleHttp\Psr7\Response(200);
    }
}

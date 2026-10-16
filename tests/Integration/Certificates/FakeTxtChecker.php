<?php

namespace Pterodactyl\Tests\Integration\Certificates;

use Pterodactyl\Services\Acme\DnsTxtChecker;

/** A resolver that sees the TXT record when the test says so. */
class FakeTxtChecker extends DnsTxtChecker
{
    public bool $visible = true;

    /** @var list<array{name: string, value: string}> */
    public array $looked = [];

    /** @var (callable(): void)|null */
    public $onLook = null;

    public function has(string $name, string $value): bool
    {
        $this->looked[] = ['name' => $name, 'value' => $value];
        if ($this->onLook !== null) {
            ($this->onLook)();
        }

        return $this->visible;
    }
}

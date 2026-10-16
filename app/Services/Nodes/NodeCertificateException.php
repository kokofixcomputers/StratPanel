<?php

namespace Pterodactyl\Services\Nodes;

class NodeCertificateException extends \RuntimeException
{
    public function __construct(string $message, public readonly bool $needsConfirmation = false)
    {
        parent::__construct($message);
    }
}

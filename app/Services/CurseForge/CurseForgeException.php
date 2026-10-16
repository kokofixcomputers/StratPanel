<?php

namespace Pterodactyl\Services\CurseForge;

use Exception;

/** Something went wrong asking CurseForge, the message is safe to show to a person. */
class CurseForgeException extends Exception
{
    public function __construct(string $message, private int $status = 502)
    {
        parent::__construct($message);
    }

    /** The HTTP status the panel answers with. */
    public function status(): int
    {
        return $this->status;
    }
}

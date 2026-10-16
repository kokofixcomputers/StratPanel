<?php

namespace Pterodactyl\Services\Auth\Passkeys;

/** A passkey was refused. The message is safe to show to the person. */
class PasskeyException extends \RuntimeException
{
}

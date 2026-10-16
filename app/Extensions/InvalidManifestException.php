<?php

namespace Pterodactyl\Extensions;

use Exception;

/** extension.json is missing, broken, or asks for something that is not allowed. */
class InvalidManifestException extends Exception
{
}

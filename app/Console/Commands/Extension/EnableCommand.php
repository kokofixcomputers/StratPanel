<?php

namespace Pterodactyl\Console\Commands\Extension;

class EnableCommand extends ToggleCommand
{
    protected $signature = 'p:extension:enable {id : The id of the extension}';

    protected $description = 'Switch an extension on.';

    protected function target(): bool
    {
        return true;
    }
}

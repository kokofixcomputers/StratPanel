<?php

namespace Pterodactyl\Console\Commands\Extension;

class DisableCommand extends ToggleCommand
{
    protected $signature = 'p:extension:disable {id : The id of the extension}';

    protected $description = 'Switch an extension off. Works even when the extension is what keeps the panel from working.';

    protected function target(): bool
    {
        return false;
    }
}

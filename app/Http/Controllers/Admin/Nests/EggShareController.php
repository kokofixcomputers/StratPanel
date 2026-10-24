<?php

namespace Pterodactyl\Http\Controllers\Admin\Nests;

use Illuminate\Http\Response;
use Pterodactyl\Models\Egg;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Eggs\Sharing\EggExporterService;

/** The download of an egg as a file (importing one is part of the admin API, see Api\Client\Admin\EggsController). */
class EggShareController extends Controller
{
    public function __construct(protected EggExporterService $exporterService)
    {
    }

    /**
     * Export an egg and its associated data into a new JSON file.
     *
     * @throws \Pterodactyl\Exceptions\Repository\RecordNotFoundException
     */
    public function export(Egg $egg): Response
    {
        $filename = trim(preg_replace('/\W/', '-', kebab_case($egg->name)), '-');

        return response($this->exporterService->handle($egg->id), 200, [
            'Content-Transfer-Encoding' => 'binary',
            'Content-Description' => 'File Transfer',
            'Content-Disposition' => 'attachment; filename=egg-' . $filename . '.json',
            'Content-Type' => 'application/json',
        ]);
    }
}

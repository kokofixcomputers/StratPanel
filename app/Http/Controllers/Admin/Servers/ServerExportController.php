<?php

namespace Pterodactyl\Http\Controllers\Admin\Servers;

use Illuminate\Support\Str;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Servers\ServerExportService;

class ServerExportController extends Controller
{
    public function __construct(private ServerExportService $exporter)
    {
    }

    /**
     * Downloads the export file of a server: the file the new server page of another panel reads.
     */
    public function __invoke(Server $server): JsonResponse
    {
        $name = Str::slug($server->name) ?: 'server';

        return new JsonResponse($this->exporter->handle($server), 200, [
            'Content-Disposition' => 'attachment; filename="' . $name . '.stratserver.json"',
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Repositories\Wings\DaemonImportRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Files\ImportRequest;

/**
 * Looks at a remote SFTP or FTP server before importing from it. The import itself is a job (JobController). The login of the remote
 * server is passed on for this one request and never stored or logged.
 */
class ImportController extends ClientApiController
{
    public function __construct(private DaemonImportRepository $import)
    {
        parent::__construct();
    }

    /**
     * Connects to the remote server and shows what is in the folder and the fingerprint of the server, without copying anything.
     *
     * @throws DisplayException
     */
    public function test(ImportRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse($this->import->setServer($server)->test($request->payload()));
    }
}

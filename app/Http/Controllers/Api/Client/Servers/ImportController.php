<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Repositories\Wings\DaemonImportRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Files\ImportRequest;

/**
 * Copies the files of a remote SFTP or FTP server into a server. The node does the work; the panel passes the request and streams the
 * progress back. The login of the remote server is used for this one request and never stored or logged.
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

    /**
     * Starts the import and streams how it goes: one JSON line per step, see the importer of Wings.
     *
     * @throws DisplayException
     */
    public function run(ImportRequest $request, Server $server): StreamedResponse|JsonResponse
    {
        // Replacing files is changing them.
        if ($request->boolean('overwrite') && !$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new DisplayException('You may add files to this server but not replace the ones that are there. Turn off "replace files".');
        }

        $lock = Cache::lock('files:import:' . $server->id, 7200);
        if (!$lock->get()) {
            return new JsonResponse(['errors' => [[
                'code' => 'ImportRunning',
                'status' => '409',
                'detail' => 'An import is already running for this server.',
            ]]], Response::HTTP_CONFLICT);
        }

        try {
            $upstream = $this->import->setServer($server)->stream($request->payload());
        } catch (\Throwable $exception) {
            $lock->release();

            throw $exception;
        }

        Activity::event('server:file.import')->property([
            'protocol' => $request->input('protocol'),
            'host' => $request->input('host'),
            'path' => $request->input('path') ?: '/',
            'directory' => $request->input('directory') ?: '/',
            'overwrite' => $request->boolean('overwrite'),
        ])->log();

        return new StreamedResponse(function () use ($upstream, $lock) {
            set_time_limit(0);
            ignore_user_abort(false);

            try {
                $body = $upstream->getBody();
                while (!$body->eof()) {
                    $chunk = $body->read(8192);
                    if ($chunk !== '') {
                        echo $chunk;
                        if (PHP_SAPI !== 'cli') {
                            @ob_flush();
                        }
                        flush();
                    }
                    // Nobody is listening: closing the upstream makes the node stop.
                    if (connection_aborted() === 1) {
                        break;
                    }
                }
            } finally {
                $upstream->getBody()->close();
                $lock->release();
            }
        }, Response::HTTP_OK, [
            'Content-Type' => 'application/x-ndjson',
            'Cache-Control' => 'no-cache, private',
            'X-Accel-Buffering' => 'no',
        ]);
    }
}

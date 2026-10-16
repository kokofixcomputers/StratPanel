<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Repositories\Wings\DaemonJobRepository;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Files\ImportRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Jobs\PullJobRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Jobs\ViewJobsRequest;

/**
 * The background jobs of a server (imports, archives, downloads): they run on the node, so they go on when the page is closed. This
 * lists them, follows them and cancels them, and starts the ones that are not started from the file manager.
 */
class JobController extends ClientApiController
{
    public function __construct(private DaemonJobRepository $jobs)
    {
        parent::__construct();
    }

    public function index(ViewJobsRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse([
            'object' => 'list',
            'data' => array_map(fn (array $job) => self::wrap($job), $this->jobs->setServer($server)->list()),
        ]);
    }

    public function show(ViewJobsRequest $request, Server $server, string $job): JsonResponse
    {
        $found = $this->jobs->setServer($server)->show($job);
        if ($found === null) {
            throw new NotFoundHttpException('There is no such job.');
        }

        return new JsonResponse(self::wrap($found));
    }

    /**
     * Cancels a job that is going and forgets one that is over.
     *
     * @throws DisplayException
     */
    public function destroy(ViewJobsRequest $request, Server $server, string $job): JsonResponse
    {
        $user = $request->user();
        if (!$user->can(Permission::ACTION_FILE_CREATE, $server) && !$user->can(Permission::ACTION_FILE_ARCHIVE, $server) && !$user->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new DisplayException('You may look at the jobs of this server but not stop them.');
        }

        $this->jobs->setServer($server)->cancel($job);

        Activity::event('server:job.cancel')->property('job', $job)->log();

        return new JsonResponse([], Response::HTTP_NO_CONTENT);
    }

    /**
     * Starts copying a folder of an SFTP or FTP server into this server. The login is passed on to the node for this request and not
     * kept, not logged.
     */
    public function import(ImportRequest $request, Server $server): JsonResponse
    {
        // Replacing files is changing them.
        if ($request->boolean('overwrite') && !$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new DisplayException('You may add files to this server but not replace the ones that are there. Turn off "replace files".');
        }

        $job = $this->jobs->setServer($server)->start('import', $request->payload());

        Activity::event('server:file.import')->property([
            'protocol' => $request->input('protocol'),
            'host' => $request->input('host'),
            'path' => $request->input('path') ?: '/',
            'directory' => $request->input('directory') ?: '/',
            'overwrite' => $request->boolean('overwrite'),
        ])->log();

        return new JsonResponse(self::wrap($job), Response::HTTP_ACCEPTED);
    }

    /** Downloads a list of files (one is a list too). */
    public function pull(PullJobRequest $request, Server $server): JsonResponse
    {
        $files = $request->files();
        $job = $this->jobs->setServer($server)->start('pull', ['files' => $files]);

        Activity::event('server:file.pull')
            ->property('count', count($files))
            ->property('directory', $files[0]['directory'] ?? '/')
            ->property('url', $files[0]['url'])
            ->log();

        return new JsonResponse(self::wrap($job), Response::HTTP_ACCEPTED);
    }

    /**
     * @param  array<string, mixed>  $job
     * @return array<string, mixed>
     */
    public static function wrap(array $job): array
    {
        return ['object' => 'server_job', 'attributes' => $job];
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Request;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Models\BackupCopy;
use Pterodactyl\Services\Backups\DeleteBackupService;
use Pterodactyl\Services\Backups\External\BackupCopyService;
use Pterodactyl\Services\Backups\DownloadLinkService;
use Pterodactyl\Repositories\Eloquent\BackupRepository;
use Pterodactyl\Services\Backups\InitiateBackupService;
use Pterodactyl\Repositories\Wings\DaemonBackupRepository;
use Pterodactyl\Transformers\Api\Client\BackupTransformer;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Pterodactyl\Http\Requests\Api\Client\Servers\Backups\StoreBackupRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Backups\RestoreBackupRequest;

class BackupController extends ClientApiController
{
    /**
     * BackupController constructor.
     */
    public function __construct(
        private DaemonBackupRepository $daemonRepository,
        private DeleteBackupService $deleteBackupService,
        private InitiateBackupService $initiateBackupService,
        private DownloadLinkService $downloadLinkService,
        private BackupRepository $repository,
        private BackupCopyService $copies,
    ) {
        parent::__construct();
    }

    /**
     * Returns all the backups for a given server instance in a paginated
     * result set.
     *
     * @throws AuthorizationException
     */
    public function index(Request $request, Server $server): array
    {
        if (!$request->user()->can(Permission::ACTION_BACKUP_READ, $server)) {
            throw new AuthorizationException();
        }

        $limit = min($request->query('per_page') ?? 20, 50);

        return $this->fractal->collection($server->backups()->with('copies.destination')->paginate($limit))
            ->transformWith($this->getTransformer(BackupTransformer::class))
            ->addMeta([
                'backup_count' => $this->repository->getNonFailedBackups($server)->count(),
            ])
            ->toArray();
    }

    /**
     * Starts the backup process for a server.
     *
     * @throws \Spatie\Fractalistic\Exceptions\InvalidTransformation
     * @throws \Spatie\Fractalistic\Exceptions\NoTransformerSpecified
     * @throws \Throwable
     */
    public function store(StoreBackupRequest $request, Server $server): array
    {
        $action = $this->initiateBackupService
            ->setIgnoredFiles(explode(PHP_EOL, $request->input('ignored') ?? ''));

        // Only set the lock status if the user even has permission to delete backups,
        // otherwise ignore this status. This gets a little funky since it isn't clear
        // how best to allow a user to create a backup that is locked without also preventing
        // them from just filling up a server with backups that can never be deleted?
        if ($request->user()->can(Permission::ACTION_BACKUP_DELETE, $server)) {
            $action->setIsLocked($request->boolean('is_locked'));
        }

        $backup = Activity::event('server:backup.start')->transaction(function ($log) use ($action, $server, $request) {
            $server->backups()->lockForUpdate()->count();

            $backup = $action->handle($server, $request->input('name'));

            $log->subject($backup)->property([
                'name' => $backup->name,
                'locked' => $request->boolean('is_locked'),
            ]);

            return $backup;
        });

        return $this->fractal->item($backup)
            ->transformWith($this->getTransformer(BackupTransformer::class))
            ->toArray();
    }

    /**
     * Toggles the lock status of a given backup for a server.
     *
     * @throws \Throwable
     * @throws AuthorizationException
     */
    public function toggleLock(Request $request, Server $server, Backup $backup): array
    {
        if (!$request->user()->can(Permission::ACTION_BACKUP_DELETE, $server)) {
            throw new AuthorizationException();
        }

        $action = $backup->is_locked ? 'server:backup.unlock' : 'server:backup.lock';

        $backup->update(['is_locked' => !$backup->is_locked]);

        Activity::event($action)->subject($backup)->property('name', $backup->name)->log();

        return $this->fractal->item($backup)
            ->transformWith($this->getTransformer(BackupTransformer::class))
            ->toArray();
    }

    /**
     * Returns information about a single backup.
     *
     * @throws AuthorizationException
     */
    public function view(Request $request, Server $server, Backup $backup): array
    {
        if (!$request->user()->can(Permission::ACTION_BACKUP_READ, $server)) {
            throw new AuthorizationException();
        }

        return $this->fractal->item($backup)
            ->transformWith($this->getTransformer(BackupTransformer::class))
            ->toArray();
    }

    /**
     * Deletes a backup from the panel as well as the remote source where it is currently
     * being stored.
     *
     * @throws \Throwable
     */
    public function delete(Request $request, Server $server, Backup $backup): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_BACKUP_DELETE, $server)) {
            throw new AuthorizationException();
        }

        $this->deleteBackupService->handle($backup);

        Activity::event('server:backup.delete')
            ->subject($backup)
            ->property(['name' => $backup->name, 'failed' => !$backup->is_successful])
            ->log();

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    /**
     * Download the backup for a given server instance. For daemon local files, the file
     * will be streamed back through the Panel. For AWS S3 files, a signed URL will be generated
     * which the user is redirected to.
     *
     * @throws \Throwable
     * @throws AuthorizationException
     */
    public function download(Request $request, Server $server, Backup $backup): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_BACKUP_DOWNLOAD, $server)) {
            throw new AuthorizationException();
        }

        if ($backup->disk !== Backup::ADAPTER_AWS_S3 && $backup->disk !== Backup::ADAPTER_WINGS) {
            throw new BadRequestHttpException('The backup requested references an unknown disk driver type and cannot be downloaded.');
        }

        // From a copy outside the node when one was asked for, or when the node does not have the file any more.
        $copy = $this->chosenCopy($request, $backup);
        $url = $copy ? $this->copies->downloadUrl($copy) : $this->downloadLinkService->handle($backup, $request->user());

        Activity::event('server:backup.download')->subject($backup)->property('name', $backup->name)->log();

        return new JsonResponse([
            'object' => 'signed_url',
            'attributes' => ['url' => $url],
        ]);
    }

    /**
     * Handles restoring a backup by making a request to the Wings instance telling it
     * to begin the process of finding (or downloading) the backup and unpacking it
     * over the server files.
     *
     * If the "truncate" flag is passed through in this request then all the
     * files that currently exist on the server will be deleted before restoring.
     * Otherwise, the archive will simply be unpacked over the existing files.
     *
     * @throws \Throwable
     */
    public function restore(RestoreBackupRequest $request, Server $server, Backup $backup): JsonResponse
    {
        // Cannot restore a backup unless a server is fully installed and not currently
        // processing a different backup restoration request.
        if (!is_null($server->status)) {
            throw new BadRequestHttpException('This server is not currently in a state that allows for a backup to be restored.');
        }

        if (!$backup->is_successful || is_null($backup->completed_at)) {
            throw new BadRequestHttpException('This backup cannot be restored at this time: not completed or failed.');
        }

        $log = Activity::event('server:backup.restore')
            ->subject($backup)
            ->property(['name' => $backup->name, 'truncate' => $request->input('truncate')]);

        $log->transaction(function () use ($backup, $server, $request) {
            // If the backup is for an S3 file we need to generate a unique Download link for
            // it that will allow Wings to actually access the file.
            $adapter = null;
            $copy = $this->chosenCopy($request, $backup);
            if ($copy) {
                // A copy outside the node is read from a link, the way an S3 backup is.
                $url = $this->copies->downloadUrl($copy);
                $adapter = Backup::ADAPTER_AWS_S3;
            } elseif ($backup->disk === Backup::ADAPTER_AWS_S3) {
                $url = $this->downloadLinkService->handle($backup, $request->user());
            }

            // Update the status right away for the server so that we know not to allow certain
            // actions against it via the Panel API.
            $server->update(['status' => Server::STATUS_RESTORING_BACKUP]);

            $daemon = $this->daemonRepository->setServer($server);
            $adapter ? $daemon->restore($backup, $url ?? null, $request->input('truncate'), $adapter) : $daemon->restore($backup, $url ?? null, $request->input('truncate'));
        });

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    /**
     * The copy outside the node that a request asks for (`copy`, the id of a destination), or the first one that is stored when the
     * node does not have the file any more. Null means the file on the node.
     *
     * @throws BadRequestHttpException
     */
    private function chosenCopy(Request $request, Backup $backup): ?BackupCopy
    {
        $wanted = $request->input('copy', $request->query('copy'));
        $query = $backup->copies()->where('status', BackupCopy::STORED);
        if ($wanted !== null && $wanted !== '' && $wanted !== 'local') {
            $copy = (clone $query)->where('destination_id', (int) $wanted)->first();
            if (!$copy) {
                throw new BadRequestHttpException('That backup has no stored copy there.');
            }

            return $copy;
        }
        if ($backup->local_removed) {
            $copy = $query->first();
            if (!$copy) {
                throw new BadRequestHttpException('The backup is not on the node any more and has no stored copy.');
            }

            return $copy;
        }

        return null;
    }
}

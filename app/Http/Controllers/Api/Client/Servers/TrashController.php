<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Pterodactyl\Models\ServerTrashItem;
use Pterodactyl\Services\Trash\TrashService;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Trash\ListTrashRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Trash\DeleteTrashRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Trash\RestoreTrashRequest;

/**
 * The trash bin of a server: what was deleted from it, to look at, recover or delete for good.
 */
class TrashController extends ClientApiController
{
    public function __construct(private TrashService $trash)
    {
        parent::__construct();
    }

    public function index(ListTrashRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse([
            // Off means nothing new is kept, what is in there is still there until it expires.
            'enabled' => $this->trash->enabled(),
            'retention_days' => $this->trash->retentionDays(),
            'data' => $this->trash->items($server)->map(fn (ServerTrashItem $item) => [
                'id' => $item->uuid,
                'type' => $item->type,
                'name' => $item->name,
                'path' => $item->path,
                'size' => $item->size,
                'deleted_by' => $item->deleter?->username,
                'deleted_at' => $item->created_at?->toIso8601String(),
                'expires_at' => $item->expires_at->toIso8601String(),
            ])->all(),
        ]);
    }

    /**
     * Recovering needs the permission to recover, and the permission to make that kind of thing (it puts a file back).
     *
     * @throws DisplayException
     */
    public function restore(RestoreTrashRequest $request, Server $server, string $item): JsonResponse
    {
        $entry = $this->find($server, $item);

        $creates = $entry->type === ServerTrashItem::SCHEDULE ? Permission::ACTION_SCHEDULE_CREATE : Permission::ACTION_FILE_CREATE;
        abort_unless($request->user()->can($creates, $server), 403);

        $where = $this->trash->restore($server, $entry, $request->user());

        return new JsonResponse(['restored_to' => $where]);
    }

    /** @throws DisplayException */
    public function delete(DeleteTrashRequest $request, Server $server, string $item): JsonResponse
    {
        $this->trash->delete($server, $this->find($server, $item), $request->user());

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    public function empty(DeleteTrashRequest $request, Server $server): JsonResponse
    {
        $this->trash->empty($server, $request->user());

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    private function find(Server $server, string $uuid): ServerTrashItem
    {
        return ServerTrashItem::query()->where('server_id', $server->id)->where('uuid', $uuid)->firstOrFail();
    }
}

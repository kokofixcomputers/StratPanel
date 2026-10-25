<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Database;
use Pterodactyl\Facades\Activity;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Permission;
use Pterodactyl\Contracts\Extensions\HashidsInterface;
use Pterodactyl\Services\Databases\DatabaseDataService;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

/**
 * The data editor of a database of a server: how big each database is, its tables, their rows, and changing them. Looking at the data is
 * as sensitive as the password of the database, so it needs the same permission; changing it needs the permission to update databases.
 */
class DatabaseDataController extends ClientApiController
{
    public function __construct(private DatabaseDataService $data, private HashidsInterface $hashids)
    {
        parent::__construct();
    }

    /** The size of every database of the server (anybody who may see the list). */
    public function sizes(ClientApiRequest $request, Server $server): JsonResponse
    {
        $this->allow($request, $server, Permission::ACTION_DATABASE_READ);

        // By the id the app knows a database by (the hash), not the number.
        $sizes = [];
        foreach ($this->data->sizes($server->databases()->with('host')->get()) as $id => $size) {
            $sizes[$this->hashids->encode($id)] = $size;
        }

        return new JsonResponse(['sizes' => (object) $sizes]);
    }

    public function tables(ClientApiRequest $request, Server $server, Database $database): JsonResponse
    {
        $this->allow($request, $server, Permission::ACTION_DATABASE_VIEW_PASSWORD, $database);

        return new JsonResponse($this->data->tables($database));
    }

    public function rows(ClientApiRequest $request, Server $server, Database $database, string $table): JsonResponse
    {
        $this->allow($request, $server, Permission::ACTION_DATABASE_VIEW_PASSWORD, $database);

        return new JsonResponse($this->data->rows(
            $database,
            $table,
            (int) $request->query('page', 1),
            (int) $request->query('per_page', 25),
            $request->query('sort') ? (string) $request->query('sort') : null,
            strtolower((string) $request->query('direction', 'asc'))
        ));
    }

    public function insert(Request $request, Server $server, Database $database, string $table): JsonResponse
    {
        $this->allow($request, $server, Permission::ACTION_DATABASE_UPDATE, $database);
        $data = $request->validate(['values' => 'present|array']);

        $this->data->insert($database, $table, $data['values']);
        Activity::event('server:database.row.create')->subject($database)->property(['name' => $database->database, 'table' => $table])->log();

        return new JsonResponse([], 201);
    }

    public function update(Request $request, Server $server, Database $database, string $table): JsonResponse
    {
        $this->allow($request, $server, Permission::ACTION_DATABASE_UPDATE, $database);
        $data = $request->validate(['key' => 'required|array', 'values' => 'required|array']);

        $this->data->update($database, $table, $data['key'], $data['values']);
        Activity::event('server:database.row.update')->subject($database)->property(['name' => $database->database, 'table' => $table, 'columns' => array_keys($data['values'])])->log();

        return new JsonResponse([]);
    }

    public function delete(Request $request, Server $server, Database $database, string $table): JsonResponse
    {
        $this->allow($request, $server, Permission::ACTION_DATABASE_UPDATE, $database);
        $data = $request->validate(['key' => 'required|array']);

        $this->data->delete($database, $table, $data['key']);
        Activity::event('server:database.row.delete')->subject($database)->property(['name' => $database->database, 'table' => $table])->log();

        return new JsonResponse([], 204);
    }

    /** The permission, and that the database is one of this server. */
    private function allow(Request $request, Server $server, string $permission, ?Database $database = null): void
    {
        abort_unless($request->user()->can($permission, $server), 403);
        abort_if($database !== null && $database->server_id !== $server->id, 404);
    }
}

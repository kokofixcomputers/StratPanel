<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\DatabaseHost;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Databases\Hosts\HostUpdateService;
use Pterodactyl\Services\Databases\Hosts\HostCreationService;
use Pterodactyl\Services\Databases\Hosts\HostDeletionService;
use Pterodactyl\Contracts\Repository\DatabaseRepositoryInterface;
use Pterodactyl\Contracts\Repository\DatabaseHostRepositoryInterface;
use Pterodactyl\Http\Controllers\Api\Client\Admin\Concerns\FormatsAdminResponses;

/** Database hosts for the admin pages: the database servers that servers get their databases from. */
class DatabaseHostsController extends Controller
{
    use FormatsAdminResponses;

    public function __construct(
        private DatabaseHostRepositoryInterface $repository,
        private DatabaseRepositoryInterface $databaseRepository,
        private HostCreationService $creationService,
        private HostUpdateService $updateService,
        private HostDeletionService $deletionService,
    ) {
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'hosts' => $this->repository->getWithViewDetails()->map(fn (DatabaseHost $host) => [
                'id' => $host->id,
                'name' => $host->name,
                'host' => $host->host,
                'port' => $host->port,
                'username' => $host->username,
                'databases' => (int) $host->databases_count,
                'node' => $host->node ? ['id' => $host->node->id, 'name' => $host->node->name] : null,
            ])->values()->all(),
        ]);
    }

    /** @throws \Pterodactyl\Exceptions\Repository\RecordNotFoundException */
    public function view(Request $request, int $host): JsonResponse
    {
        $found = $this->repository->find($host);
        $databases = $this->databaseRepository->getDatabasesForHost($host);

        return new JsonResponse([
            'host' => $this->host($found),
            'databases' => $databases->map(fn ($database) => [
                'id' => $database->id,
                'database' => $database->database,
                'username' => $database->username,
                'remote' => $database->remote,
                'max_connections' => $database->max_connections,
                'server' => ['id' => $database->server->id, 'name' => $database->server->name],
            ])->values()->all(),
            'pagination' => $this->pagination($databases),
        ]);
    }

    /** @throws \Throwable */
    public function store(Request $request): JsonResponse
    {
        $host = $this->sayDatabaseErrors(fn () => $this->creationService->handle($this->validated($request)));

        return new JsonResponse($this->host($host), 201);
    }

    /** @throws \Throwable */
    public function update(Request $request, int $host): JsonResponse
    {
        $found = DatabaseHost::query()->findOrFail($host);
        $this->sayDatabaseErrors(fn () => $this->updateService->handle($found->id, $this->validated($request, $found->id)));

        return new JsonResponse($this->host($found->refresh()));
    }

    /** @throws \Pterodactyl\Exceptions\Service\HasActiveServersException */
    public function destroy(int $host): JsonResponse
    {
        $this->deletionService->handle(DatabaseHost::query()->findOrFail($host)->id);

        return new JsonResponse([], 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?int $id = null): array
    {
        if (!$request->filled('node_id')) {
            $request->merge(['node_id' => null]);
        }
        $rules = $id === null ? DatabaseHost::getRules() : DatabaseHost::getRulesForUpdate($id);
        $request->validate($rules);

        return $request->only(array_keys($rules));
    }

    /** @return array<string, mixed> */
    private function host(DatabaseHost $host): array
    {
        // The password is never sent back.
        return [
            'id' => $host->id,
            'name' => $host->name,
            'host' => $host->host,
            'port' => $host->port,
            'username' => $host->username,
            'node_id' => $host->node_id,
        ];
    }
}

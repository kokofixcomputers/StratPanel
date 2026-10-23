<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Location;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Locations\LocationUpdateService;
use Pterodactyl\Services\Locations\LocationCreationService;
use Pterodactyl\Services\Locations\LocationDeletionService;
use Pterodactyl\Contracts\Repository\LocationRepositoryInterface;

/** Locations for the admin pages: where the nodes are. */
class LocationsController extends Controller
{
    public function __construct(
        private LocationRepositoryInterface $repository,
        private LocationCreationService $creationService,
        private LocationUpdateService $updateService,
        private LocationDeletionService $deletionService,
    ) {
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'locations' => $this->repository->getAllWithDetails()->map(fn (Location $location) => [
                'id' => $location->id,
                'short' => $location->short,
                'long' => $location->long,
                'nodes' => (int) $location->nodes_count,
                'servers' => (int) $location->servers_count,
            ])->values()->all(),
        ]);
    }

    /** @throws \Pterodactyl\Exceptions\Repository\RecordNotFoundException */
    public function view(int $location): JsonResponse
    {
        $found = $this->repository->getWithNodes($location);

        return new JsonResponse([
            'id' => $found->id,
            'short' => $found->short,
            'long' => $found->long,
            'nodes' => $found->nodes->map(fn ($node) => [
                'id' => $node->id,
                'name' => $node->name,
                'fqdn' => $node->fqdn,
                'servers' => $node->servers->count(),
            ])->values()->all(),
        ]);
    }

    /** @throws \Throwable */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(Location::getRules());
        $location = $this->creationService->handle($this->normalize($data));

        return new JsonResponse(['id' => $location->id, 'short' => $location->short, 'long' => $location->long], 201);
    }

    /** @throws \Throwable */
    public function update(Request $request, int $location): JsonResponse
    {
        $found = Location::query()->findOrFail($location);
        $data = $request->validate(Location::getRulesForUpdate($found->id));
        $this->updateService->handle($found->id, $this->normalize($data));

        return new JsonResponse(['id' => $found->id]);
    }

    /** @throws \Throwable */
    public function destroy(int $location): JsonResponse
    {
        $this->deletionService->handle(Location::query()->findOrFail($location)->id);

        return new JsonResponse([], 204);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalize(array $data): array
    {
        return ['short' => $data['short'], 'long' => $data['long'] ?? null];
    }
}

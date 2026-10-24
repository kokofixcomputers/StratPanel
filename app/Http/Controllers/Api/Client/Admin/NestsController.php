<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Nest;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Nests\NestUpdateService;
use Pterodactyl\Services\Nests\NestCreationService;
use Pterodactyl\Services\Nests\NestDeletionService;
use Pterodactyl\Http\Requests\Admin\Nest\StoreNestFormRequest;

/** Nests (categories of eggs) for the admin pages. */
class NestsController extends Controller
{
    public function __construct(
        private NestCreationService $creation,
        private NestUpdateService $update,
        private NestDeletionService $deletion,
    ) {
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'nests' => Nest::query()->withCount(['eggs', 'servers'])->orderBy('name')->get()->map(fn (Nest $nest) => [
                'id' => $nest->id,
                'name' => $nest->name,
                'author' => $nest->author,
                'description' => $nest->description,
                'eggs' => (int) $nest->eggs_count,
                'servers' => (int) $nest->servers_count,
            ])->values()->all(),
        ]);
    }

    /** Every nest with its eggs, for the forms that ask which nest an egg belongs to or which egg to copy from. */
    public function lookup(): JsonResponse
    {
        return new JsonResponse([
            'nests' => Nest::query()->with('eggs:id,name,author,nest_id')->orderBy('name')->get()->map(fn (Nest $nest) => [
                'id' => $nest->id,
                'name' => $nest->name,
                'author' => $nest->author,
                'eggs' => $nest->eggs->sortBy('name')->map(fn (Egg $egg) => ['id' => $egg->id, 'name' => $egg->name, 'author' => $egg->author])->values()->all(),
            ])->values()->all(),
        ]);
    }

    public function view(int $nest): JsonResponse
    {
        return new JsonResponse($this->details(Nest::query()->with('eggs')->withCount('servers')->findOrFail($nest)));
    }

    public function store(StoreNestFormRequest $request): JsonResponse
    {
        $nest = $this->creation->handle($request->normalize());

        return new JsonResponse($this->details($nest->load('eggs')->loadCount('servers')), 201);
    }

    public function update(StoreNestFormRequest $request, int $nest): JsonResponse
    {
        $this->update->handle($nest, $request->normalize());

        return new JsonResponse($this->details(Nest::query()->with('eggs')->withCount('servers')->findOrFail($nest)));
    }

    public function destroy(int $nest): JsonResponse
    {
        $this->deletion->handle($nest);

        return new JsonResponse([], 204);
    }

    /** @return array<string, mixed> */
    private function details(Nest $nest): array
    {
        $eggs = $nest->eggs->loadCount('servers');

        return [
            'id' => $nest->id,
            'uuid' => $nest->uuid,
            'name' => $nest->name,
            'author' => $nest->author,
            'description' => $nest->description,
            'servers' => (int) $nest->servers_count,
            'eggs' => $eggs->sortBy('name')->map(fn (Egg $egg) => [
                'id' => $egg->id,
                'name' => $egg->name,
                'author' => $egg->author,
                'description' => $egg->description,
                'servers' => (int) $egg->servers_count,
            ])->values()->all(),
        ];
    }
}

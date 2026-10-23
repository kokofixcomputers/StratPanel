<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Ramsey\Uuid\Uuid;
use Illuminate\Http\Request;
use Pterodactyl\Models\Mount;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;

/** Mounts for the admin pages: folders of a node that servers can use. */
class MountsController extends Controller
{
    public function index(): JsonResponse
    {
        return new JsonResponse([
            'mounts' => Mount::query()->withCount('eggs', 'nodes', 'servers')->orderBy('name')->get()->map(fn (Mount $mount) => [
                'id' => $mount->id,
                'name' => $mount->name,
                'source' => $mount->source,
                'target' => $mount->target,
                'eggs' => (int) $mount->eggs_count,
                'nodes' => (int) $mount->nodes_count,
                'servers' => (int) $mount->servers_count,
            ])->values()->all(),
        ]);
    }

    public function view(int $mount): JsonResponse
    {
        return new JsonResponse($this->details(Mount::query()->with('eggs', 'nodes')->findOrFail($mount)));
    }

    /** @throws \Throwable */
    public function store(Request $request): JsonResponse
    {
        $model = (new Mount())->fill($request->validate(Mount::getRules()));
        $model->forceFill(['uuid' => Uuid::uuid4()->toString()]);
        $model->saveOrFail();

        return new JsonResponse($this->details($model->fresh(['eggs', 'nodes'])), 201);
    }

    public function update(Request $request, int $mount): JsonResponse
    {
        $found = Mount::query()->findOrFail($mount);
        $found->forceFill($request->validate(Mount::getRulesForUpdate($found->id)))->save();

        return new JsonResponse($this->details($found->fresh(['eggs', 'nodes'])));
    }

    public function destroy(int $mount): JsonResponse
    {
        Mount::query()->findOrFail($mount)->delete();

        return new JsonResponse([], 204);
    }

    public function addEggs(Request $request, int $mount): JsonResponse
    {
        $found = Mount::query()->findOrFail($mount);
        $data = $request->validate(['eggs' => 'required|array|min:1', 'eggs.*' => 'integer|exists:eggs,id']);
        $found->eggs()->syncWithoutDetaching($data['eggs']);

        return new JsonResponse($this->details($found->fresh(['eggs', 'nodes'])));
    }

    public function addNodes(Request $request, int $mount): JsonResponse
    {
        $found = Mount::query()->findOrFail($mount);
        $data = $request->validate(['nodes' => 'required|array|min:1', 'nodes.*' => 'integer|exists:nodes,id']);
        $found->nodes()->syncWithoutDetaching($data['nodes']);

        return new JsonResponse($this->details($found->fresh(['eggs', 'nodes'])));
    }

    public function removeEgg(int $mount, int $egg): JsonResponse
    {
        Mount::query()->findOrFail($mount)->eggs()->detach($egg);

        return new JsonResponse([], 204);
    }

    public function removeNode(int $mount, int $node): JsonResponse
    {
        Mount::query()->findOrFail($mount)->nodes()->detach($node);

        return new JsonResponse([], 204);
    }

    /** @return array<string, mixed> */
    private function details(Mount $mount): array
    {
        return [
            'id' => $mount->id,
            'uuid' => $mount->uuid,
            'name' => $mount->name,
            'description' => $mount->description,
            'source' => $mount->source,
            'target' => $mount->target,
            'read_only' => (bool) $mount->read_only,
            'user_mountable' => (bool) $mount->user_mountable,
            'eggs' => $mount->eggs->map(fn ($egg) => ['id' => $egg->id, 'name' => $egg->name])->values()->all(),
            'nodes' => $mount->nodes->map(fn ($node) => ['id' => $node->id, 'name' => $node->name, 'fqdn' => $node->fqdn])->values()->all(),
        ];
    }
}

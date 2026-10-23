<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\Location;
use Pterodactyl\Http\Controllers\Controller;

/** Small lists the forms of several pages need. */
class LookupsController extends Controller
{
    /** Every location with its nodes, for the lists that ask which node something is for. */
    public function nodes(): JsonResponse
    {
        return new JsonResponse([
            'locations' => Location::query()->with('nodes:id,name,location_id')->orderBy('short')->get()->map(fn (Location $location) => [
                'id' => $location->id,
                'short' => $location->short,
                'nodes' => $location->nodes->map(fn ($node) => ['id' => $node->id, 'name' => $node->name])->values()->all(),
            ])->values()->all(),
        ]);
    }

    /** Every nest with its eggs, for the lists that ask which egg something is for. */
    public function eggs(): JsonResponse
    {
        return new JsonResponse([
            'nests' => Nest::query()->with('eggs:id,name,nest_id')->orderBy('name')->get()->map(fn (Nest $nest) => [
                'id' => $nest->id,
                'name' => $nest->name,
                'eggs' => $nest->eggs->sortBy('name')->map(fn ($egg) => ['id' => $egg->id, 'name' => $egg->name])->values()->all(),
            ])->values()->all(),
        ]);
    }
}

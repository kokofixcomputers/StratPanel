<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Node;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\StorePackage;
use Pterodactyl\Models\StoreOrder;
use Pterodactyl\Http\Controllers\Controller;

/** Admin > Packages: what the store sells, and how much resource each package gives. */
class PackagesController extends Controller
{
    private function rules(): array
    {
        return [
            'name' => 'required|string|between:1,191',
            'description' => 'nullable|string|max:2000',
            'kind' => 'required|in:server,box',
            'active' => 'required|boolean',
            'sort' => 'required|integer|between:0,100000',
            'price' => 'required|integer|min:1|max:100000000',
            'period_days' => 'nullable|integer|min:1|max:3660',
            'memory' => 'required|integer|min:512|max:4194304',
            'disk' => 'required|integer|min:1024|max:104857600',
            'cpu' => 'required|integer|min:50|max:100000',
            'allocations' => 'required|integer|min:1|max:500',
            'backups' => 'required|integer|min:0|max:5000',
            'databases' => 'required|integer|min:0|max:500',
            'node_id' => 'nullable|integer|exists:nodes,id',
            'egg_id' => 'nullable|integer|exists:eggs,id',
        ];
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'packages' => StorePackage::query()->orderBy('sort')->orderBy('id')->get()->map(fn (StorePackage $p) => self::present($p))->values()->all(),
            'nodes' => Node::query()->orderBy('name')->get(['id', 'name'])->map(fn ($n) => ['id' => $n->id, 'name' => $n->name])->all(),
            'eggs' => Egg::query()->orderBy('name')->get(['id', 'name'])->map(fn ($e) => ['id' => $e->id, 'name' => $e->name])->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $package = StorePackage::query()->create($request->validate($this->rules()));
        Activity::event('package:create')->property(['name' => $package->name])->log();

        return new JsonResponse(self::present($package), 201);
    }

    public function update(Request $request, int $package): JsonResponse
    {
        $found = StorePackage::query()->findOrFail($package);
        $found->fill($request->validate($this->rules()))->save();
        Activity::event('package:update')->property(['name' => $found->name])->log();

        return new JsonResponse(self::present($found));
    }

    /** What was bought stays (the orders keep what it was), the package just stops being for sale. */
    public function destroy(int $package): JsonResponse
    {
        $found = StorePackage::query()->findOrFail($package);
        $name = $found->name;
        $found->delete();
        Activity::event('package:delete')->property(['name' => $name])->log();

        return new JsonResponse([], 204);
    }

    /** @return array<string, mixed> */
    public static function present(StorePackage $p): array
    {
        return [
            'id' => $p->id,
            'uuid' => $p->uuid,
            'name' => $p->name,
            'description' => $p->description,
            'kind' => $p->kind,
            'active' => $p->active,
            'sort' => $p->sort,
            'price' => $p->price,
            'period_days' => $p->period_days,
            'memory' => $p->memory,
            'disk' => $p->disk,
            'cpu' => $p->cpu,
            'allocations' => $p->allocations,
            'backups' => $p->backups,
            'databases' => $p->databases,
            'node_id' => $p->node_id,
            'egg_id' => $p->egg_id,
            'sold' => StoreOrder::query()->where('package_id', $p->id)->where('status', StoreOrder::PAID)->count(),
        ];
    }
}

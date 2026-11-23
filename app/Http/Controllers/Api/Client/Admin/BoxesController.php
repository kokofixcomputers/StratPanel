<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Carbon\Carbon;
use Pterodactyl\Models\Box;
use Pterodactyl\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Boxes\BoxService;
use Pterodactyl\Services\Boxes\BoxPresenter;
use Pterodactyl\Http\Controllers\Api\Client\Admin\Concerns\FormatsAdminResponses;

/** Admin > Boxes: every box, made for a person without a payment or bought in the store, and what is in it. */
class BoxesController extends Controller
{
    use FormatsAdminResponses;

    private const SPECS = [
        'memory' => 'required|integer|min:512|max:4194304',
        'disk' => 'required|integer|min:1024|max:104857600',
        'cpu' => 'required|integer|min:50|max:100000',
        'allocations' => 'required|integer|min:1|max:500',
        'backups' => 'required|integer|min:0|max:5000',
        'databases' => 'required|integer|min:0|max:500',
    ];

    public function __construct(private BoxService $boxes)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $query = Box::query()->with(['user', 'node'])->withCount('servers');
        if ($request->filled('owner_id')) {
            $query->where('user_id', (int) $request->query('owner_id'));
        }
        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(fn ($q) => $q->where('name', 'like', '%' . $search . '%')
                ->orWhereHas('user', fn ($u) => $u->where('username', 'like', $search . '%')->orWhere('email', 'like', $search . '%')));
        }
        $boxes = $query->orderByDesc('id')->paginate(25);

        return new JsonResponse([
            'boxes' => $boxes->getCollection()->map(fn (Box $b) => BoxPresenter::summary($b))->values()->all(),
            'pagination' => $this->pagination($boxes),
            // For the form of a new box.
            'nodes' => \Pterodactyl\Models\Node::query()->orderBy('name')->get(['id', 'name'])->map(fn ($n) => ['id' => $n->id, 'name' => $n->name])->all(),
        ]);
    }

    public function show(int $box): JsonResponse
    {
        return new JsonResponse(BoxPresenter::detail(Box::query()->findOrFail($box)));
    }

    /** A box for a person, without any payment. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(array_merge(self::SPECS, [
            'user_id' => 'required|integer|exists:users,id',
            'name' => 'required|string|between:1,191',
            'node_id' => 'sometimes|nullable|integer|exists:nodes,id',
            'expires_at' => 'sometimes|nullable|date|after:now',
            'notes' => 'sometimes|nullable|string|max:2000',
        ]));
        $box = $this->boxes->create(User::query()->findOrFail($data['user_id']), $data + ['source' => 'admin']);
        Activity::event('box:create')->subject($box)->property(['name' => $box->name, 'user' => $data['user_id']])->log();

        return new JsonResponse(BoxPresenter::detail($box), 201);
    }

    /** @throws \Pterodactyl\Exceptions\DisplayException */
    public function update(Request $request, int $box): JsonResponse
    {
        $found = Box::query()->findOrFail($box);
        $data = $request->validate([
            'name' => 'sometimes|string|between:1,191',
            'node_id' => 'sometimes|nullable|integer|exists:nodes,id',
            'memory' => 'sometimes|integer|min:512|max:4194304',
            'disk' => 'sometimes|integer|min:1024|max:104857600',
            'cpu' => 'sometimes|integer|min:50|max:100000',
            'allocations' => 'sometimes|integer|min:1|max:500',
            'backups' => 'sometimes|integer|min:0|max:5000',
            'databases' => 'sometimes|integer|min:0|max:500',
            'expires_at' => 'sometimes|nullable|date',
            'notes' => 'sometimes|nullable|string|max:2000',
        ]);
        if (array_key_exists('expires_at', $data) && $data['expires_at'] !== null) {
            $data['expires_at'] = Carbon::parse($data['expires_at']);
        }

        $this->boxes->update($found, $data);
        // Time that was added to a box that ran out lets it run again.
        if ($found->status === Box::EXPIRED && (!$found->expires_at || $found->expires_at->isFuture())) {
            $this->boxes->unsuspend($found);
        }
        Activity::event('box:update')->subject($found)->property(['name' => $found->name])->log();

        return new JsonResponse(BoxPresenter::detail($found->refresh()));
    }

    /** Suspends or unsuspends the box and every server in it. */
    public function suspend(Request $request, int $box): JsonResponse
    {
        $found = Box::query()->findOrFail($box);
        $request->boolean('suspended', true) ? $this->boxes->suspend($found) : $this->boxes->unsuspend($found);
        Activity::event($request->boolean('suspended', true) ? 'box:suspend' : 'box:unsuspend')->subject($found)->property(['name' => $found->name])->log();

        return new JsonResponse(BoxPresenter::detail($found->refresh()));
    }

    /** @throws \Pterodactyl\Exceptions\DisplayException */
    public function destroy(Request $request, int $box): JsonResponse
    {
        $found = Box::query()->findOrFail($box);
        $data = $request->validate(['servers' => 'sometimes|in:refuse,detach,delete']);
        $name = $found->name;
        $this->boxes->delete($found, $data['servers'] ?? 'refuse');
        Activity::event('box:delete')->property(['name' => $name])->log();

        return new JsonResponse([], 204);
    }
}

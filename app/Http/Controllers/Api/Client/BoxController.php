<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Pterodactyl\Models\Box;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Services\Boxes\BoxService;
use Pterodactyl\Services\Boxes\BoxPresenter;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/**
 * The boxes a person owns and the servers inside them. An admin with the permission opens any box here, which is how they see it the way its
 * owner does.
 */
class BoxController extends ClientApiController
{
    private const SHARE = [
        'memory' => 'required|integer|min:512|max:4194304',
        'disk' => 'required|integer|min:1024|max:104857600',
        'cpu' => 'required|integer|min:50|max:100000',
        'allocations' => 'required|integer|min:1|max:200',
        'backups' => 'required|integer|min:0|max:1000',
        'databases' => 'required|integer|min:0|max:200',
    ];

    public function __construct(private BoxService $boxes)
    {
        parent::__construct();
    }

    public function index(ClientApiRequest $request): JsonResponse
    {
        $boxes = Box::query()->where('user_id', $request->user()->id)->with(['node', 'user'])->withCount('servers')->orderBy('id')->get();

        return new JsonResponse(['data' => $boxes->map(fn (Box $b) => BoxPresenter::summary($b))->values()->all()]);
    }

    public function show(ClientApiRequest $request, string $box): JsonResponse
    {
        return new JsonResponse(BoxPresenter::detail($this->find($request, $box, 'boxes.view')));
    }

    /** @throws \Throwable */
    public function createServer(ClientApiRequest $request, string $box): JsonResponse
    {
        $found = $this->find($request, $box, 'boxes.update');
        $data = $request->validate(array_merge(self::SHARE, [
            'name' => ['required', 'string', 'between:1,191'],
            'description' => 'nullable|string|max:500',
            'node_id' => 'sometimes|nullable|integer|exists:nodes,id',
        ]));

        $server = $this->boxes->createServer($found, $data['name'], $data['description'] ?? '', array_intersect_key($data, self::SHARE), $data['node_id'] ?? null);
        Activity::event('user:box.server-create')->property(['box' => $found->name, 'server' => $server->name])->log();

        return new JsonResponse(BoxPresenter::detail($found->refresh()), 201);
    }

    /** @throws \Throwable */
    public function resizeServer(ClientApiRequest $request, string $box, string $member): JsonResponse
    {
        $found = $this->find($request, $box, 'boxes.update');
        $data = $request->validate(self::SHARE);
        $target = Server::query()->where('uuid', $member)->where('box_id', $found->id)->firstOrFail();

        $this->boxes->resizeServer($found, $target, $data);
        Activity::event('user:box.server-resize')->property(['box' => $found->name, 'server' => $target->name])->log();

        return new JsonResponse(BoxPresenter::detail($found->refresh()));
    }

    /** The box of this person, or any box for an admin who may. */
    private function find(ClientApiRequest $request, string $uuid, string $permission): Box
    {
        $box = Box::query()->where('uuid', $uuid)->firstOrFail();
        $user = $request->user();
        if ($box->user_id !== $user->id && !$user->hasPermission($permission)) {
            throw new AuthorizationException();
        }

        return $box;
    }
}

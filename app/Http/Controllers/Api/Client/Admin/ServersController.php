<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\User;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Location;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\EggVariable;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Models\Filters\AdminServerFilter;
use Pterodactyl\Http\Requests\Admin\ServerFormRequest;
use Pterodactyl\Services\Servers\ServerCreationService;
use Pterodactyl\Services\Servers\ServerDeletionService;
use Pterodactyl\Services\Servers\ServerImportService;
use Pterodactyl\Services\Servers\DetailsModificationService;
use Pterodactyl\Http\Controllers\Api\Client\Admin\Concerns\FormatsAdminResponses;

/** Servers for the admin pages: the list, one server, making one and changing its details. */
class ServersController extends Controller
{
    use FormatsAdminResponses;

    public function __construct(
        private ServerCreationService $creation,
        private ServerImportService $import,
        private DetailsModificationService $details,
        private ServerDeletionService $deletion,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = Server::query()->with('node', 'user', 'allocation');
        if ($request->filled('owner_id')) {
            $query->where('servers.owner_id', (int) $request->query('owner_id'));
        }
        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            (new AdminServerFilter())($query, $search, '*');
        }
        $servers = $query->orderBy('servers.id')->paginate((int) config('pterodactyl.paginate.admin.servers', 25));

        return new JsonResponse([
            'servers' => $servers->getCollection()->map(fn (Server $server) => [
                'id' => $server->id,
                'uuid' => $server->uuid,
                'uuid_short' => $server->uuidShort,
                'name' => $server->name,
                'owner' => ['id' => $server->user->id, 'username' => $server->user->username],
                'node' => ['id' => $server->node->id, 'name' => $server->node->name],
                'connection' => $server->allocation ? $server->allocation->alias . ':' . $server->allocation->port : null,
                'state' => $this->state($server),
            ])->values()->all(),
            'pagination' => $this->pagination($servers),
        ]);
    }

    /** What the form of a new server chooses from: nodes by location, and eggs by nest with their variables. */
    public function form(): JsonResponse
    {
        return new JsonResponse([
            'locations' => Location::query()->with('nodes:id,name,location_id')->orderBy('short')->get()->map(fn (Location $location) => [
                'id' => $location->id,
                'short' => $location->short,
                'long' => $location->long,
                'nodes' => $location->nodes->map(fn (Node $node) => ['id' => $node->id, 'name' => $node->name])->values()->all(),
            ])->values()->all(),
            'nests' => $this->nests(),
        ]);
    }

    public function view(int $serverId): JsonResponse
    {
        return new JsonResponse($this->summary($this->find($serverId)));
    }

    /** @throws \Throwable */
    public function store(ServerFormRequest $request): JsonResponse
    {
        $data = $request->except(['_token', 'import_document']);
        if (!empty($data['custom_image'])) {
            $data['image'] = $data['custom_image'];
            unset($data['custom_image']);
        }

        $server = $this->creation->handle($data);
        $schedules = $this->import->restoreSchedules($server, $request->input('import_document'));

        return new JsonResponse(['id' => $server->id, 'schedules' => $schedules], 201);
    }

    /** @throws \Throwable */
    public function updateDetails(Request $request, int $serverId): JsonResponse
    {
        $server = $this->find($serverId);
        $rules = collect(Server::getRulesForUpdate($server))->only(['external_id', 'owner_id', 'name', 'description'])->toArray();
        $rules['description'][] = 'nullable';
        $request->validate($rules);

        $this->details->handle($server, $request->only(['owner_id', 'external_id', 'name', 'description']));

        return new JsonResponse($this->summary($this->find($serverId)));
    }

    /** Deletes the server (with force it goes on when the daemon does not answer). */
    public function destroy(Request $request, int $serverId): JsonResponse
    {
        $this->deletion->withForce($request->boolean('force'))->handle($this->find($serverId));

        return new JsonResponse([], 204);
    }

    private function find(int $id): Server
    {
        return Server::query()->with(['node', 'user', 'allocation', 'nest', 'egg'])->findOrFail($id);
    }

    private function state(Server $server): string
    {
        return $server->isSuspended() ? 'suspended' : (!$server->isInstalled() ? 'installing' : 'active');
    }

    /** @return array<string, mixed> */
    private function summary(Server $server): array
    {
        return [
            'id' => $server->id,
            'uuid' => $server->uuid,
            'uuid_short' => $server->uuidShort,
            'external_id' => $server->external_id,
            'name' => $server->name,
            'description' => (string) $server->description,
            'state' => $this->state($server),
            'cpu' => (int) $server->cpu,
            'threads' => $server->threads,
            'memory' => (int) $server->memory,
            'swap' => (int) $server->swap,
            'disk' => (int) $server->disk,
            'io' => (int) $server->io,
            'oom_disabled' => (bool) $server->oom_disabled,
            'database_limit' => $server->database_limit,
            'allocation_limit' => $server->allocation_limit,
            'backup_limit' => $server->backup_limit,
            'nest' => ['id' => $server->nest->id, 'name' => $server->nest->name],
            'egg' => ['id' => $server->egg->id, 'name' => $server->egg->name],
            'owner' => $this->person($server->user),
            'node' => ['id' => $server->node->id, 'name' => $server->node->name],
            'allocation' => $server->allocation ? ['ip' => $server->allocation->ip, 'alias' => $server->allocation->alias, 'port' => $server->allocation->port, 'has_alias' => $server->allocation->alias !== $server->allocation->ip] : null,
        ];
    }

    /** @return array<string, mixed> */
    private function person(User $user): array
    {
        return ['id' => $user->id, 'username' => $user->username, 'email' => $user->email, 'name_first' => $user->name_first, 'name_last' => $user->name_last, 'gravatar' => 'https://www.gravatar.com/avatar/' . md5(strtolower($user->email)) . '?s=120'];
    }

    /** @return array<int, array<string, mixed>> */
    private function nests(): array
    {
        return Nest::query()->with('eggs.variables')->orderBy('name')->get()->map(fn (Nest $nest) => [
            'id' => $nest->id,
            'name' => $nest->name,
            'eggs' => $nest->eggs->sortBy('name')->map(fn ($egg) => [
                'id' => $egg->id,
                'uuid' => $egg->uuid,
                'name' => $egg->name,
                'docker_images' => $egg->docker_images,
                'startup' => $egg->startup,
                'variables' => $egg->variables->map(fn (EggVariable $variable) => [
                    'id' => $variable->id,
                    'name' => $variable->name,
                    'description' => (string) $variable->description,
                    'env_variable' => $variable->env_variable,
                    'default_value' => (string) $variable->default_value,
                    'rules' => $variable->rules,
                    'required' => str_contains((string) $variable->rules, 'required'),
                ])->values()->all(),
            ])->values()->all(),
        ])->values()->all();
    }

    /** The people to choose an owner from. */
    public function people(Request $request): JsonResponse
    {
        if ($request->filled('user_id')) {
            $people = User::query()->whereKey((int) $request->query('user_id'))->get();
        } else {
            $term = trim((string) $request->query('search', ''));
            $people = $term === '' ? collect() : User::query()
                ->where(fn ($query) => $query->where('email', 'like', $term . '%')->orWhere('username', 'like', $term . '%'))
                ->orderBy('email')->limit(25)->get();
        }

        return new JsonResponse(['people' => $people->map(fn (User $user) => $this->person($user))->values()->all()]);
    }

    /** The allocations of a node that no server has, for the forms that give a server some. */
    public function freeAllocations(int $node): JsonResponse
    {
        return new JsonResponse([
            'allocations' => Allocation::query()->where('node_id', Node::query()->findOrFail($node)->id)->whereNull('server_id')
                ->orderByRaw('INET_ATON(ip) ASC')->orderBy('port')->get()
                ->map(fn (Allocation $allocation) => ['id' => $allocation->id, 'text' => $allocation->alias . ':' . $allocation->port])->values()->all(),
        ]);
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\DashboardFolder;
use Pterodactyl\Models\DashboardServerPref;
use Illuminate\Validation\ValidationException;

/**
 * The folders and stars of the dashboard. They belong to the person: they only ever see and change their own, and a server only
 * goes into their folder when they can reach it.
 */
class DashboardLayoutController extends ClientApiController
{
    /**
     * The folders (in order) and what was done with each server.
     */
    public function index(Request $request): array
    {
        return $this->layout($request);
    }

    public function storeFolder(Request $request): array
    {
        $user = $request->user();
        $this->validate($request, ['name' => ['required', 'string', 'min:1', 'max:40']]);

        if (DashboardFolder::query()->where('user_id', $user->id)->count() >= DashboardFolder::MAX_PER_USER) {
            throw ValidationException::withMessages(['name' => 'There can be at most ' . DashboardFolder::MAX_PER_USER . ' folders.']);
        }

        $name = trim($request->input('name'));
        $this->assertNameFree($request, $name);

        DashboardFolder::query()->create([
            'user_id' => $user->id,
            'name' => $name,
            'position' => (int) DashboardFolder::query()->where('user_id', $user->id)->max('position') + 1,
        ]);

        return $this->layout($request);
    }

    public function updateFolder(Request $request, int $folder): array
    {
        $model = $this->folder($request, $folder);
        $this->validate($request, ['name' => ['required', 'string', 'min:1', 'max:40']]);

        $name = trim($request->input('name'));
        $this->assertNameFree($request, $name, $model->id);
        $model->update(['name' => $name]);

        return $this->layout($request);
    }

    public function destroyFolder(Request $request, int $folder): array
    {
        // The servers in it stay on the dashboard, they are just not in a folder any more.
        $this->folder($request, $folder)->delete();

        return $this->layout($request);
    }

    /**
     * The new order of the folders, as the list of their ids.
     */
    public function reorder(Request $request): array
    {
        $user = $request->user();
        $this->validate($request, ['order' => ['required', 'array'], 'order.*' => ['integer']]);

        $mine = DashboardFolder::query()->where('user_id', $user->id)->pluck('id')->all();
        $position = 0;
        foreach (array_values(array_unique(array_map('intval', $request->input('order')))) as $id) {
            if (in_array($id, $mine, true)) {
                DashboardFolder::query()->where('id', $id)->update(['position' => ++$position]);
            }
        }

        return $this->layout($request);
    }

    /**
     * Puts a server in a folder (or takes it out with null) and stars or unstars it. Only what is sent is changed.
     */
    public function setServer(Request $request, string $uuid): array
    {
        $user = $request->user();
        $this->validate($request, ['folder' => ['sometimes', 'nullable', 'integer'], 'starred' => ['sometimes', 'boolean']]);

        /** @var Server $server */
        $server = $user->accessibleServers()->where('servers.uuid', $uuid)->first();
        if (is_null($server)) {
            abort(404);
        }

        $changes = [];
        if ($request->has('folder')) {
            $folder = $request->input('folder');
            if (!is_null($folder)) {
                $folder = $this->folder($request, (int) $folder)->id;
            }
            $changes['folder_id'] = $folder;
        }
        if ($request->has('starred')) {
            $changes['starred'] = $request->boolean('starred');
        }

        if (!empty($changes)) {
            DashboardServerPref::query()->updateOrCreate(['user_id' => $user->id, 'server_id' => $server->id], $changes);
        }

        return $this->layout($request);
    }

    private function folder(Request $request, int $id): DashboardFolder
    {
        return DashboardFolder::query()->where('user_id', $request->user()->id)->where('id', $id)->firstOrFail();
    }

    private function assertNameFree(Request $request, string $name, ?int $except = null): void
    {
        $taken = DashboardFolder::query()
            ->where('user_id', $request->user()->id)
            ->where('name', $name)
            ->when($except, fn ($q) => $q->where('id', '!=', $except))
            ->exists();

        if ($taken) {
            throw ValidationException::withMessages(['name' => 'You already have a folder with that name.']);
        }
    }

    private function layout(Request $request): array
    {
        $user = $request->user();

        $folders = DashboardFolder::query()->where('user_id', $user->id)->orderBy('position')->orderBy('id')->get();
        // Only servers the person can still reach: access that was taken away leaves a harmless row behind.
        $prefs = DashboardServerPref::query()
            ->where('dashboard_server_prefs.user_id', $user->id)
            ->join('servers', 'servers.id', '=', 'dashboard_server_prefs.server_id')
            ->select('dashboard_server_prefs.*', 'servers.uuid as server_uuid')
            ->get()
            ->filter(fn ($pref) => $pref->folder_id !== null || $pref->starred)
            ->values();

        return [
            'object' => 'dashboard_layout',
            'attributes' => [
                'folders' => $folders->map(fn (DashboardFolder $f) => ['id' => $f->id, 'name' => $f->name])->all(),
                'servers' => $prefs->map(fn ($p) => [
                    'uuid' => $p->server_uuid,
                    'folder' => $p->folder_id,
                    'starred' => (bool) $p->starred,
                ])->all(),
            ],
        ];
    }
}

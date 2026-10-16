<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\CurseForge\CurseForgeService;
use Pterodactyl\Services\CurseForge\CurseForgeException;

/**
 * What the panel lets the browser ask CurseForge, one fixed set of reads. The key never leaves the panel, so the browser
 * cannot be used to ask CurseForge for anything else: every parameter is checked and only known paths are built.
 */
class CurseForgeController extends Controller
{
    private const SEARCH_TTL = 300;

    private const MOD_TTL = 600;

    private const LIST_TTL = 21600;

    public function __construct(private CurseForgeService $curseForge)
    {
    }

    /** Whether an admin has added a key, the Content pages only offer CurseForge when this is true. */
    public function status(): JsonResponse
    {
        return new JsonResponse(['enabled' => $this->curseForge->enabled()]);
    }

    public function search(Request $request): JsonResponse
    {
        $data = $request->validate([
            'classId' => 'nullable|integer|min:1',
            'categoryIds' => ['nullable', 'regex:/^\d+(,\d+){0,9}$/'],
            'gameVersion' => ['nullable', 'regex:/^[0-9A-Za-z.\-+_ ]{1,40}$/'],
            'modLoaderType' => 'nullable|integer|between:0,6',
            'searchFilter' => 'nullable|string|max:100',
            'sortField' => 'nullable|integer|between:1,12',
            'sortOrder' => 'nullable|in:asc,desc',
            'index' => 'nullable|integer|between:0,9999',
            'pageSize' => 'nullable|integer|between:1,50',
        ]);

        $query = ['gameId' => CurseForgeService::GAME_ID];
        foreach (['classId', 'gameVersion', 'modLoaderType', 'searchFilter', 'sortField', 'sortOrder', 'index', 'pageSize'] as $key) {
            if (isset($data[$key]) && $data[$key] !== '') {
                $query[$key] = $data[$key];
            }
        }
        if (!empty($data['categoryIds'])) {
            $ids = array_map('intval', explode(',', $data['categoryIds']));
            // One category is a plain parameter, several are a list that CurseForge reads as JSON.
            if (count($ids) === 1) {
                $query['categoryId'] = $ids[0];
            } else {
                $query['categoryIds'] = json_encode($ids);
            }
        }
        // A loader only means something together with a version, CurseForge ignores or rejects it otherwise.
        if (isset($query['modLoaderType']) && !isset($query['gameVersion'])) {
            unset($query['modLoaderType']);
        }

        return $this->answer(fn () => $this->curseForge->get('/v1/mods/search', $query, self::SEARCH_TTL));
    }

    public function mod(int $mod): JsonResponse
    {
        return $this->answer(fn () => $this->curseForge->get("/v1/mods/{$mod}", [], self::MOD_TTL));
    }

    public function description(int $mod): JsonResponse
    {
        return $this->answer(fn () => $this->curseForge->get("/v1/mods/{$mod}/description", [], self::MOD_TTL));
    }

    public function files(Request $request, int $mod): JsonResponse
    {
        $data = $request->validate([
            'gameVersion' => ['nullable', 'regex:/^[0-9A-Za-z.\-+_ ]{1,40}$/'],
            'index' => 'nullable|integer|between:0,9999',
            'pageSize' => 'nullable|integer|between:1,50',
        ]);
        $query = array_filter(
            ['gameVersion' => $data['gameVersion'] ?? null, 'index' => $data['index'] ?? null, 'pageSize' => $data['pageSize'] ?? null],
            fn ($value) => $value !== null && $value !== ''
        );

        return $this->answer(fn () => $this->curseForge->get("/v1/mods/{$mod}/files", $query, self::MOD_TTL));
    }

    public function changelog(int $mod, int $file): JsonResponse
    {
        return $this->answer(fn () => $this->curseForge->get("/v1/mods/{$mod}/files/{$file}/changelog", [], self::LIST_TTL));
    }

    /** Several mods at once, which is how the panel shows the names and pictures of what a mod needs or what is installed. */
    public function mods(Request $request): JsonResponse
    {
        $ids = $this->ids($request);

        return $this->answer(fn () => $this->curseForge->post('/v1/mods', ['modIds' => $ids, 'filterPcOnly' => false], self::MOD_TTL));
    }

    public function bulkFiles(Request $request): JsonResponse
    {
        $ids = $this->ids($request);

        return $this->answer(fn () => $this->curseForge->post('/v1/mods/files', ['fileIds' => $ids], self::MOD_TTL));
    }

    /** The categories, and the classes (mods, plugins, worlds...) that hold them. Changes rarely. */
    public function categories(): JsonResponse
    {
        return $this->answer(fn () => $this->curseForge->get('/v1/categories', ['gameId' => CurseForgeService::GAME_ID], self::LIST_TTL));
    }

    public function versions(): JsonResponse
    {
        return $this->answer(fn () => $this->curseForge->get('/v1/minecraft/version', ['sortDescending' => 'true'], self::LIST_TTL));
    }

    /** Which mods files belong to, found by their fingerprints (see lib/curseforge.ts in the frontend). */
    public function fingerprints(Request $request): JsonResponse
    {
        $data = $request->validate([
            'fingerprints' => 'required|array|min:1|max:200',
            'fingerprints.*' => 'required|integer|min:0|max:4294967295',
        ]);
        $fingerprints = array_map('intval', array_values($data['fingerprints']));

        return $this->answer(fn () => $this->curseForge->post('/v1/fingerprints/' . CurseForgeService::GAME_ID, ['fingerprints' => $fingerprints], self::MOD_TTL));
    }

    /** @return list<int> */
    private function ids(Request $request): array
    {
        $data = $request->validate([
            'ids' => 'required|array|min:1|max:50',
            'ids.*' => 'required|integer|min:1',
        ]);

        return array_map('intval', array_values($data['ids']));
    }

    private function answer(callable $call): JsonResponse
    {
        try {
            return new JsonResponse($call());
        } catch (CurseForgeException $exception) {
            // The same shape as every other error of the API, so the panel shows the message.
            return new JsonResponse([
                'errors' => [['code' => 'CurseForgeError', 'status' => (string) $exception->status(), 'detail' => $exception->getMessage()]],
            ], $exception->status());
        }
    }
}

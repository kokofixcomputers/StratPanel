<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Pterodactyl\Models\Egg;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Eggs\EggUpdateService;
use Pterodactyl\Services\Eggs\EggCreationService;
use Pterodactyl\Services\Eggs\EggDeletionService;
use Pterodactyl\Http\Requests\Admin\Egg\EggFormRequest;
use Pterodactyl\Http\Requests\Admin\Egg\EggImportFormRequest;
use Pterodactyl\Services\Eggs\Sharing\EggImporterService;
use Pterodactyl\Services\Eggs\Sharing\EggUpdateImporterService;

/** Eggs for the admin pages: the details of one, making, changing and deleting them, and importing them from a file. */
class EggsController extends Controller
{
    public function __construct(
        private EggCreationService $creation,
        private EggUpdateService $update,
        private EggDeletionService $deletion,
        private EggImporterService $importer,
        private EggUpdateImporterService $updateImporter,
    ) {
    }

    public function view(int $egg): JsonResponse
    {
        return new JsonResponse($this->details(Egg::query()->with('nest.eggs')->findOrFail($egg)));
    }

    public function store(EggFormRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['docker_images'] = $this->normalizeDockerImages($data['docker_images'] ?? null);

        return new JsonResponse($this->details($this->creation->handle($data)->load('nest.eggs')), 201);
    }

    public function updateEgg(EggFormRequest $request, int $egg): JsonResponse
    {
        $found = Egg::query()->findOrFail($egg);
        $data = $request->validated();
        $data['docker_images'] = $this->normalizeDockerImages($data['docker_images'] ?? null);
        $this->update->handle($found, $data);

        return new JsonResponse($this->details($found->refresh()->load('nest.eggs')));
    }

    public function destroy(int $egg): JsonResponse
    {
        $found = Egg::query()->findOrFail($egg);
        $this->deletion->handle($found->id);

        return new JsonResponse(['nest_id' => $found->nest_id]);
    }

    /** A new egg from a file. */
    public function import(EggImportFormRequest $request): JsonResponse
    {
        $egg = $this->importer->handle($request->file('import_file'), $request->input('import_to_nest'));

        return new JsonResponse(['id' => $egg->id], 201);
    }

    /** The settings of an egg replaced by what a file holds. */
    public function updateFromFile(EggImportFormRequest $request, int $egg): JsonResponse
    {
        $found = Egg::query()->findOrFail($egg);
        $this->updateImporter->handle($found, $request->file('import_file'));

        return new JsonResponse($this->details($found->refresh()->load('nest.eggs')));
    }

    /** @return array<string, mixed> */
    private function details(Egg $egg): array
    {
        $pretty = fn (?string $json) => $json === null ? '' : json_encode(json_decode($json), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return [
            'id' => $egg->id,
            'uuid' => $egg->uuid,
            'author' => $egg->author,
            'name' => $egg->name,
            'description' => $egg->description,
            'nest' => ['id' => $egg->nest->id, 'name' => $egg->nest->name],
            // The other eggs of the nest, to copy settings from.
            'siblings' => $egg->nest->eggs->where('id', '!=', $egg->id)->sortBy('name')->map(fn (Egg $other) => ['id' => $other->id, 'name' => $other->name, 'author' => $other->author])->values()->all(),
            // One per line, "Name|image" when the name is not the image.
            'docker_images' => implode("\n", array_map(
                fn ($key, $value) => $key === $value ? $value : "$key|$value",
                array_keys($egg->docker_images),
                $egg->docker_images,
            )),
            'force_outgoing_ip' => (bool) $egg->force_outgoing_ip,
            'startup' => $egg->startup,
            'features' => $egg->features ?? [],
            'config_from' => $egg->config_from,
            'config_stop' => (string) $egg->config_stop,
            'config_logs' => $pretty($egg->config_logs),
            'config_files' => $pretty($egg->config_files),
            'config_startup' => $pretty($egg->config_startup),
        ];
    }

    /** @return array<string, string> */
    private function normalizeDockerImages(?string $input = null): array
    {
        $data = array_map(fn ($value) => trim($value), explode("\n", $input ?? ''));
        $images = [];

        // Iterate over the image data provided and convert it into a name => image pairing that is used to improve the display on the front-end.
        foreach ($data as $value) {
            $parts = explode('|', $value, 2);
            $images[$parts[0]] = empty($parts[1]) ? $parts[0] : $parts[1];
        }

        return $images;
    }
}

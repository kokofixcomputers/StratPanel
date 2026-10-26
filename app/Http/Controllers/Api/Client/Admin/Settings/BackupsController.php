<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin\Settings;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\BackupCopy;
use Pterodactyl\Models\BackupDestination;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Backups\External\Stores;
use Pterodactyl\Services\Backups\External\BackupCopyService;
use Pterodactyl\Services\Backups\External\BackupRetentionService;

/** Where backups are kept outside the node (S3, WebDAV, a folder), how much of it, and the copies in each, for the admin pages. */
class BackupsController extends Controller
{
    /** What each type of destination is set up with; the ones in BackupDestination::SECRETS are never given back. */
    private const FIELDS = [
        BackupDestination::S3 => ['bucket', 'key', 'secret', 'region', 'endpoint', 'prefix', 'path_style'],
        BackupDestination::WEBDAV => ['url', 'username', 'password'],
        BackupDestination::FOLDER => ['path'],
    ];

    public function __construct(private Stores $stores, private BackupCopyService $copies, private BackupRetentionService $retention)
    {
    }

    public function index(): JsonResponse
    {
        $stats = BackupCopy::query()
            ->selectRaw('destination_id, status, COUNT(*) as total, SUM(bytes) as bytes')
            ->groupBy('destination_id', 'status')->get()->groupBy('destination_id');

        return new JsonResponse([
            'destinations' => BackupDestination::query()->orderBy('name')->get()->map(function (BackupDestination $destination) use ($stats) {
                $rows = $stats->get($destination->id, collect());
                $count = fn (string $status) => (int) ($rows->firstWhere('status', $status)?->total ?? 0);

                return $this->summary($destination) + ['stats' => [
                    'stored' => $count(BackupCopy::STORED),
                    'working' => $count(BackupCopy::PENDING) + $count(BackupCopy::UPLOADING),
                    'failed' => $count(BackupCopy::FAILED),
                    'bytes' => (int) ($rows->firstWhere('status', BackupCopy::STORED)?->bytes ?? 0),
                ]];
            })->values()->all(),
            'types' => BackupDestination::TYPES,
            'backups' => Backup::query()->where('is_successful', true)->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $destination = new BackupDestination();
        $this->fill($destination, $request);
        $destination->save();

        return new JsonResponse($this->summary($destination), 201);
    }

    public function update(Request $request, int $destination): JsonResponse
    {
        $destination = BackupDestination::query()->findOrFail($destination);
        $this->fill($destination, $request);
        $destination->save();

        return new JsonResponse($this->summary($destination));
    }

    public function destroy(int $destination): JsonResponse
    {
        $destination = BackupDestination::query()->findOrFail($destination);

        // A backup that was removed from its node and only has a copy here would be lost with it.
        $only = Backup::query()->where('local_removed', true)->whereHas('copies', fn ($q) => $q->where('destination_id', $destination->id))
            ->whereDoesntHave('copies', fn ($q) => $q->where('destination_id', '!=', $destination->id)->where('status', BackupCopy::STORED))->count();
        if ($only > 0) {
            throw new DisplayException("$only backups are only kept here, the node does not have them any more. Copy them somewhere else, or delete them, first.");
        }

        // What is kept here is deleted with it (a copy that can not be deleted is left, with a note in the log).
        $destination->copies()->get()->each(fn (BackupCopy $copy) => $this->copies->forget($copy, true));
        $destination->delete();

        return new JsonResponse([], 204);
    }

    /** Tries the settings: writes a small file, reads it back and deletes it. The form can be tested before it is saved. */
    public function test(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => ['required', Rule::in(BackupDestination::TYPES)], 'id' => 'nullable|integer']);
        $config = $this->config($request, $data['type'], !empty($data['id']) ? BackupDestination::query()->find($data['id']) : null);

        try {
            $this->stores->make($data['type'], $config)->check();
        } catch (\Throwable $exception) {
            return new JsonResponse(['ok' => false, 'message' => $exception->getMessage()]);
        }

        return new JsonResponse(['ok' => true, 'message' => 'It works: a file was written, read back and deleted.']);
    }

    /** Copies the backups that were made before this destination was added. */
    public function backfill(int $destination): JsonResponse
    {
        $destination = BackupDestination::query()->findOrFail($destination);
        if (!$destination->enabled) {
            throw new DisplayException('Turn the destination on first.');
        }

        return new JsonResponse(['queued' => $this->copies->backfill($destination)]);
    }

    /** Applies the limits of a destination now, instead of at the next hourly run. */
    public function prune(int $destination): JsonResponse
    {
        return new JsonResponse(['deleted' => $this->retention->prune(BackupDestination::query()->findOrFail($destination))]);
    }

    /** Tries the copies that failed again. */
    public function retry(int $destination): JsonResponse
    {
        $destination = BackupDestination::query()->findOrFail($destination);
        $queued = 0;
        $destination->copies()->where('status', BackupCopy::FAILED)->with('backup')->get()->each(function (BackupCopy $copy) use ($destination, &$queued) {
            $this->copies->queue($copy->backup, $destination);
            ++$queued;
        });

        return new JsonResponse(['queued' => $queued]);
    }

    private function fill(BackupDestination $destination, Request $request): void
    {
        $data = $request->validate([
            'name' => 'required|string|max:191',
            'type' => ['required', Rule::in(BackupDestination::TYPES)],
            'enabled' => 'boolean',
            'auto_copy' => 'boolean',
            'delete_local' => 'boolean',
            'keep_last' => 'nullable|integer|min:1|max:100000',
            'keep_days' => 'nullable|integer|min:1|max:36500',
            'max_gb' => 'nullable|integer|min:1|max:10000000',
        ]);
        if ($destination->exists && $destination->type !== $data['type']) {
            throw new DisplayException('The type of a destination can not be changed, add a new one.');
        }

        $config = $this->config($request, $data['type'], $destination->exists ? $destination : null);
        $destination->fill([
            'name' => $data['name'],
            'type' => $data['type'],
            'config' => $config,
            'enabled' => (bool) ($data['enabled'] ?? true),
            'auto_copy' => (bool) ($data['auto_copy'] ?? true),
            'delete_local' => (bool) ($data['delete_local'] ?? false),
            'keep_last' => $data['keep_last'] ?? null,
            'keep_days' => $data['keep_days'] ?? null,
            'max_gb' => $data['max_gb'] ?? null,
        ]);
    }

    /**
     * The settings of a type from the request. A secret that was left empty is the one that was saved.
     *
     * @return array<string, mixed>
     */
    private function config(Request $request, string $type, ?BackupDestination $saved): array
    {
        $rules = match ($type) {
            BackupDestination::S3 => ['config.bucket' => 'required|string|max:191', 'config.key' => 'required|string|max:191', 'config.secret' => 'nullable|string|max:500', 'config.region' => 'nullable|string|max:64', 'config.endpoint' => 'nullable|url|max:255', 'config.prefix' => 'nullable|string|max:191', 'config.path_style' => 'nullable|boolean'],
            BackupDestination::WEBDAV => ['config.url' => 'required|url|max:500', 'config.username' => 'nullable|string|max:191', 'config.password' => 'nullable|string|max:500'],
            default => ['config.path' => ['required', 'string', 'max:500', 'starts_with:/', 'not_regex:/\.\./']],
        };
        $input = $request->validate($rules)['config'] ?? [];

        $config = [];
        foreach (self::FIELDS[$type] as $field) {
            $value = $input[$field] ?? null;
            if (in_array($field, BackupDestination::SECRETS, true) && ($value === null || $value === '')) {
                $value = $saved?->config[$field] ?? null;
            }
            if ($value !== null && $value !== '') {
                $config[$field] = $field === 'path_style' ? (bool) $value : $value;
            }
        }
        if ($type === BackupDestination::S3 && empty($config['secret'])) {
            throw new DisplayException('Give the secret key.');
        }

        return $config;
    }

    /** @return array<string, mixed> */
    private function summary(BackupDestination $destination): array
    {
        $config = [];
        foreach ($destination->config ?? [] as $field => $value) {
            if (in_array($field, BackupDestination::SECRETS, true)) {
                $config['has_' . $field] = true;
            } else {
                $config[$field] = $value;
            }
        }

        return [
            'id' => $destination->id,
            'name' => $destination->name,
            'type' => $destination->type,
            'config' => $config,
            'enabled' => $destination->enabled,
            'auto_copy' => $destination->auto_copy,
            'delete_local' => $destination->delete_local,
            'keep_last' => $destination->keep_last,
            'keep_days' => $destination->keep_days,
            'max_gb' => $destination->max_gb,
        ];
    }
}

<?php

namespace Pterodactyl\Transformers\Api\Client;

use Pterodactyl\Models\Backup;

class BackupTransformer extends BaseClientTransformer
{
    public function getResourceName(): string
    {
        return Backup::RESOURCE_NAME;
    }

    public function transform(Backup $backup): array
    {
        return [
            'uuid' => $backup->uuid,
            'is_successful' => $backup->is_successful,
            'is_locked' => $backup->is_locked,
            'name' => $backup->name,
            'ignored_files' => $backup->ignored_files,
            'checksum' => $backup->checksum,
            'bytes' => $backup->bytes,
            // Whether the file is on the node, and the copies outside it (see BackupCopyService).
            'local' => !$backup->local_removed,
            'copies' => $backup->copies->map(fn ($copy) => [
                'destination' => $copy->destination_id,
                'name' => $copy->destination?->name,
                'type' => $copy->destination?->type,
                'status' => $copy->status,
                'bytes' => $copy->bytes,
                'stored_at' => $copy->stored_at?->toAtomString(),
            ])->values()->all(),
            'created_at' => $backup->created_at->toAtomString(),
            'completed_at' => $backup->completed_at ? $backup->completed_at->toAtomString() : null,
        ];
    }
}

<?php

namespace Pterodactyl\Http\Controllers\Base;

use Pterodactyl\Models\BackupCopy;
use Pterodactyl\Http\Controllers\Controller;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Pterodactyl\Services\Backups\External\BackupCopyService;

/**
 * Hands out a copy of a backup that is kept outside the node (WebDAV, a folder) through the panel. The link is signed and short lived: the
 * panel makes it for the person who downloads, and for Wings when it restores from the copy, neither logs in here.
 */
class BackupCopyDownloadController extends Controller
{
    public function __construct(private BackupCopyService $copies)
    {
    }

    public function __invoke(int $copy): StreamedResponse
    {
        $copy = BackupCopy::query()->where('status', BackupCopy::STORED)->with('backup.server')->findOrFail($copy);
        $stream = $this->copies->stream($copy);

        return response()->stream(function () use ($stream) {
            while (!$stream->eof()) {
                echo $stream->read(1024 * 1024);
                flush();
            }
        }, 200, array_filter([
            'Content-Type' => 'application/x-gzip',
            'Content-Disposition' => 'attachment; filename="' . $copy->backup->uuid . '.tar.gz"',
            'Content-Length' => $copy->bytes > 0 ? (string) $copy->bytes : null,
        ]));
    }
}

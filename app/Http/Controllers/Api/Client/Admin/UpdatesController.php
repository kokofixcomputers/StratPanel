<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Nodes\WingsUpdateService;
use Pterodactyl\Services\Updates\ToolUpdateService;
use Pterodactyl\Services\Updates\UiUpdateChecker;

/** Updating the panel, the router and the edge of this machine, for the admin pages. */
class UpdatesController extends Controller
{
    public function __construct(private ToolUpdateService $tools, private WingsUpdateService $nodes, private UiUpdateChecker $ui)
    {
    }

    public function index(): JsonResponse
    {
        return new JsonResponse([
            'installed' => $this->tools->installed(),
            'status' => $this->tools->status(),
            'pending' => $this->tools->pending(),
            'backups' => $this->tools->backups(),
            'wings_latest' => $this->nodes->latest(),
            'node_count' => Node::query()->count(),
            'tar_url' => config('updates.panel_tar_url'),
            'tar_nightly_url' => config('updates.panel_tar_nightly_url'),
        ]);
    }

    /** What the updater is doing, for the page to follow. */
    public function status(): JsonResponse
    {
        return new JsonResponse(['pending' => $this->tools->pending(), 'status' => $this->tools->status(), 'backups' => $this->tools->backups()]);
    }

    /** A newer web interface than the one this panel has, if any. */
    public function ui(): JsonResponse
    {
        return new JsonResponse(['update' => $this->ui->available() ?: null]);
    }

    public function run(Request $request): JsonResponse
    {
        $backup = null;
        // Anything unknown means the harmless one.
        $action = match ($request->input('action')) {
            ToolUpdateService::BACKUPS => ToolUpdateService::BACKUPS,
            ToolUpdateService::RESTORE, ToolUpdateService::DELETE_BACKUP => (function () use ($request, &$backup) {
                $backup = (string) $request->input('backup');

                return $request->input('action');
            })(),
            ToolUpdateService::DOWNLOAD => $request->input('channel') === 'nightly' ? ToolUpdateService::DOWNLOAD_NIGHTLY : ToolUpdateService::DOWNLOAD,
            ToolUpdateService::PANEL => $request->input('channel') === 'nightly' ? ToolUpdateService::PANEL_NIGHTLY : ToolUpdateService::PANEL,
            default => ToolUpdateService::LOCAL,
        };

        try {
            $this->tools->request($action, $backup);
        } catch (\InvalidArgumentException $exception) {
            return new JsonResponse(['error' => $exception->getMessage()], 422);
        } catch (\RuntimeException $exception) {
            return new JsonResponse(['error' => $exception->getMessage()], 409);
        }

        return new JsonResponse(['requested' => $action], 202);
    }
}

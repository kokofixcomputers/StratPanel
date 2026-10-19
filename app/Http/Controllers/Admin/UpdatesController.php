<?php

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Pterodactyl\Models\Node;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Nodes\WingsUpdateService;
use Pterodactyl\Services\Updates\ToolUpdateService;

class UpdatesController extends Controller
{
    public function __construct(private ToolUpdateService $tools, private WingsUpdateService $nodes)
    {
    }

    public function index(): View
    {
        return view('admin.updates', [
            'installed' => $this->tools->installed(),
            'status' => $this->tools->status(),
            'pending' => $this->tools->pending(),
            'backups' => $this->tools->backups(),
            'wingsLatest' => $this->nodes->latest(),
            'nodeCount' => Node::query()->count(),
            'tarUrl' => config('updates.panel_tar_url'),
            'tarNightlyUrl' => config('updates.panel_tar_nightly_url'),
        ]);
    }

    /** What the updater is doing, for the page to follow. */
    public function status(): JsonResponse
    {
        return new JsonResponse(['pending' => $this->tools->pending(), 'status' => $this->tools->status(), 'backups' => $this->tools->backups()]);
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

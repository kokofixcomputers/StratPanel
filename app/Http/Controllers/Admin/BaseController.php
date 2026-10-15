<?php

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\View\View;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Admin\OverviewService;
use Pterodactyl\Services\Helpers\SoftwareVersionService;

class BaseController extends Controller
{
    /**
     * BaseController constructor.
     */
    public function __construct(private SoftwareVersionService $version, private OverviewService $overview)
    {
    }

    /**
     * Return the admin index view.
     */
    public function index(): View
    {
        $nodes = $this->overview->nodes();

        return view('admin.index', [
            'version' => $this->version,
            'totals' => $this->overview->totals(),
            'nodes' => $nodes,
            'capacity' => $this->overview->capacity($nodes),
            'eggs' => $this->overview->eggs(),
            'recentServers' => $this->overview->recentServers(),
            'recentUsers' => $this->overview->recentUsers(),
            'activity' => $this->overview->recentActivity(),
        ]);
    }
}

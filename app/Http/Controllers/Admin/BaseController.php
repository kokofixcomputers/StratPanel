<?php

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\View\View;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Pterodactyl\Services\Roles\AdminNavigation;
use Pterodactyl\Http\Controllers\Controller;

class BaseController extends Controller
{
    /**
     * Return the admin index view.
     */
    public function index(Request $request): View|RedirectResponse
    {
        // Somebody whose role does not include the overview lands on the first page they may open.
        if (!$request->user()->hasPermission('overview.view')) {
            $route = AdminNavigation::landingRoute($request->user());
            abort_if($route === null || $route === 'admin.index', 403);

            return redirect()->route($route);
        }

        // The page is part of the React app, it reads its numbers from the admin API (Api\Client\Admin\OverviewController).
        return view('templates/base.core');
    }
}

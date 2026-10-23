<?php

namespace Pterodactyl\Http\Controllers\Admin;

use Illuminate\View\View;
use Pterodactyl\Http\Controllers\Controller;

/**
 * The pages of the admin area that are part of the React app: the server answers with the same page as for every other part of the
 * panel and the app draws the admin page. The data comes from the admin API (routes/api-admin.php), the permission that guards each
 * page stays on its route.
 */
class SpaController extends Controller
{
    public function __invoke(): View
    {
        return view('templates/base.core');
    }
}

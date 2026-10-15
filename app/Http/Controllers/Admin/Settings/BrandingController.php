<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Branding\BrandingService;
use Pterodactyl\Http\Requests\Admin\Settings\BrandingFormRequest;

class BrandingController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private BrandingService $branding)
    {
    }

    /**
     * Render the UI for the favicon, announcements and custom links.
     */
    public function index(): View
    {
        return view('admin.settings.branding', [
            'favicon' => $this->branding->favicon(),
            'announcements' => $this->branding->announcements(),
            'links' => $this->branding->links(),
            'locations' => BrandingService::LOCATIONS,
            'types' => BrandingService::TYPES,
        ]);
    }

    /**
     * Save everything on the page at once. The lists are posted whole, so a row that is missing was deleted.
     */
    public function update(BrandingFormRequest $request): RedirectResponse
    {
        if ($request->hasFile('favicon')) {
            $this->branding->setFavicon($request->file('favicon'));
        } elseif ($request->boolean('remove_favicon')) {
            $this->branding->removeFavicon();
        }

        $this->branding->saveAnnouncements($request->input('announcements', []));
        $this->branding->saveLinks($request->input('links', []));

        $this->alert->success('Branding has been updated.')->flash();

        return redirect()->route('admin.settings.branding');
    }
}

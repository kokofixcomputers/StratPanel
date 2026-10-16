<?php

namespace Pterodactyl\Http\Controllers\Admin\Settings;

use Illuminate\View\View;
use Illuminate\Http\RedirectResponse;
use Prologue\Alerts\AlertsMessageBag;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\CurseForge\CurseForgeService;
use Pterodactyl\Http\Requests\Admin\Settings\CurseForgeFormRequest;

class CurseForgeController extends Controller
{
    public function __construct(private AlertsMessageBag $alert, private CurseForgeService $curseForge)
    {
    }

    /** The page where an admin adds the CurseForge API key. */
    public function index(): View
    {
        return view('admin.settings.curseforge', [
            'enabled' => $this->curseForge->enabled(),
            'fromEnvironment' => $this->curseForge->fromEnvironment(),
        ]);
    }

    public function update(CurseForgeFormRequest $request): RedirectResponse
    {
        if ($request->boolean('remove_key')) {
            $this->curseForge->clearKey();
            $this->alert->success('The CurseForge API key was removed. People can no longer browse CurseForge from the panel.')->flash();

            return redirect()->route('admin.settings.curseforge');
        }

        $this->curseForge->setKey($request->input('api_key'));

        $check = $this->curseForge->verify();
        if ($check['ok']) {
            $this->alert->success('The key was saved. ' . $check['message'])->flash();
        } else {
            $this->alert->warning('The key was saved, but ' . $check['message'])->flash();
        }

        return redirect()->route('admin.settings.curseforge');
    }

    /** Asks CurseForge whether the key that is in use is accepted. */
    public function test(): RedirectResponse
    {
        $check = $this->curseForge->enabled()
            ? $this->curseForge->verify()
            : ['ok' => false, 'message' => 'there is no key to test.'];

        if ($check['ok']) {
            $this->alert->success($check['message'])->flash();
        } else {
            $this->alert->danger('The key does not work: ' . $check['message'])->flash();
        }

        return redirect()->route('admin.settings.curseforge');
    }
}

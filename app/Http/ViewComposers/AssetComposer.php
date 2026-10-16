<?php

namespace Pterodactyl\Http\ViewComposers;

use Illuminate\View\View;
use Illuminate\Support\Facades\Auth;
use Pterodactyl\Extensions\Hooks;
use Pterodactyl\Extensions\ExtensionManager;
use Pterodactyl\Services\Auth\AuthSettings;
use Pterodactyl\Services\Branding\BrandingService;
use Pterodactyl\Services\Auth\Captcha\CaptchaService;
use Pterodactyl\Services\Helpers\AssetHashService;

class AssetComposer
{
    /**
     * AssetComposer constructor.
     */
    public function __construct(
        private AssetHashService $assetHashService,
        private BrandingService $branding,
        private ExtensionManager $extensions,
        private CaptchaService $captcha,
        private AuthSettings $auth,
    ) {
    }

    /**
     * Provide access to the asset service in the views.
     */
    public function compose(View $view): void
    {
        $view->with('asset', $this->assetHashService);
        $view->with('favicon', $this->branding->favicon());
        $view->with('siteConfiguration', Hooks::filter('site.configuration', [
            'branding' => $this->branding->toArray(Auth::check()),
            'name' => config('app.name') ?? 'Pterodactyl',
            'locale' => config('app.locale') ?? 'en',
            // Kept for scripts written before there was a choice of captcha.
            'recaptcha' => [
                'enabled' => $this->captcha->provider() === CaptchaService::RECAPTCHA,
                'siteKey' => config('recaptcha.website_key') ?? '',
            ],
            'captcha' => [
                'provider' => $this->captcha->provider(),
                'siteKey' => $this->captcha->siteKey(),
            ],
            'auth' => $this->auth->forBrowser(),
            // The browser part of the extensions that are on, for people who are logged in.
            'extensions' => Auth::check() ? $this->extensions->frontend() : [],
        ]));
    }
}

<?php

namespace Pterodactyl\Http\ViewComposers;

use Illuminate\View\View;
use Pterodactyl\Extensions\Hooks;
use Illuminate\Support\Facades\Auth;
use Pterodactyl\Services\Auth\AuthSettings;
use Pterodactyl\Extensions\ExtensionManager;
use Pterodactyl\Services\Theme\ThemeService;
use Pterodactyl\Services\Branding\BrandingService;
use Pterodactyl\Services\Helpers\AssetHashService;
use Pterodactyl\Services\Auth\Captcha\CaptchaService;

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
        private ThemeService $theme,
    ) {
    }

    /**
     * Provide access to the asset service in the views.
     */
    public function compose(View $view): void
    {
        $view->with('asset', $this->assetHashService);
        $view->with('favicon', $this->branding->favicon());
        $view->with('themeCss', $this->theme->css());
        $view->with('themeConfig', $this->theme->config());
        $view->with('themeAttributes', $this->theme->attributes());
        $view->with('siteConfiguration', Hooks::filter('site.configuration', [
            'branding' => $this->branding->toArray(Auth::check()),
            'name' => config('app.name') ?? 'Pterodactyl',
            'locale' => config('app.locale') ?? 'en',
            // The clock the schedules run by.
            'timezone' => config('app.timezone') ?? 'UTC',
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
            // What the admin built in the theme editor (null: the default look), the CSS of it is in the page already.
            'theme' => $this->theme->config(),
            // The browser part of the extensions that are on, for people who are logged in.
            'extensions' => Auth::check() ? $this->extensions->frontend() : [],
        ]));
    }
}

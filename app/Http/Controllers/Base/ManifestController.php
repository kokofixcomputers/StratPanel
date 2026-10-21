<?php

namespace Pterodactyl\Http\Controllers\Base;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Http\Controllers\Controller;
use Pterodactyl\Services\Branding\BrandingService;

/**
 * The manifest of the web app: what the panel is called when somebody installs it on their phone or desktop (name, colours, icon). The
 * name and the colour are set in the theme editor, under Search and sharing. It is public, a browser asks for it without being signed in.
 */
class ManifestController extends Controller
{
    public function __construct(private BrandingService $branding)
    {
    }

    public function __invoke(): JsonResponse
    {
        $seo = $this->branding->seo();
        $name = config('app.name', 'Stratosphere');
        $appName = $seo['app_name'] !== '' ? $seo['app_name'] : ($seo['title'] !== '' ? $seo['title'] : $name);
        $color = $seo['theme_color'] !== '' ? $seo['theme_color'] : '#ffffff';
        $icon = $this->branding->favicon();

        return new JsonResponse([
            'name' => $appName,
            'short_name' => $seo['app_short_name'] !== '' ? $seo['app_short_name'] : mb_substr($appName, 0, 12),
            'description' => $seo['description'],
            'start_url' => '/',
            'scope' => '/',
            'display' => 'standalone',
            'background_color' => $color,
            'theme_color' => $color,
            'icons' => $icon !== null
                ? [['src' => $icon, 'sizes' => 'any', 'purpose' => 'any']]
                : [
                    ['src' => '/favicons/android-chrome-192x192.png', 'sizes' => '192x192', 'type' => 'image/png'],
                    ['src' => '/favicons/android-chrome-512x512.png', 'sizes' => '512x512', 'type' => 'image/png'],
                ],
        ], 200, ['Content-Type' => 'application/manifest+json']);
    }
}

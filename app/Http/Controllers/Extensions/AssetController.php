<?php

namespace Pterodactyl\Http\Controllers\Extensions;

use Illuminate\Routing\Controller;
use Pterodactyl\Extensions\ExtensionManager;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Serves the browser files of an extension (its web/ folder), so extensions never have to write into public/. Only for an extension
 * that is on and started, only files below web/, and only kinds of file a page may load: never PHP.
 */
class AssetController extends Controller
{
    private const TYPES = [
        'js' => 'text/javascript',
        'mjs' => 'text/javascript',
        'css' => 'text/css',
        'json' => 'application/json',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'woff2' => 'font/woff2',
        'woff' => 'font/woff',
        'map' => 'application/json',
    ];

    public function __construct(private ExtensionManager $extensions)
    {
    }

    public function __invoke(string $extension, string $path): BinaryFileResponse
    {
        $context = $this->extensions->context($extension);
        if ($context === null || $path === '' || str_contains($path, "\0") || str_contains($path, '\\') || in_array('..', explode('/', $path), true)) {
            abort(404);
        }

        $type = self::TYPES[strtolower(pathinfo($path, PATHINFO_EXTENSION))] ?? null;
        $root = realpath($context->path('web'));
        $file = $root === false ? false : realpath($root . '/' . $path);
        if ($type === null || $file === false || !is_file($file) || !str_starts_with($file, $root . '/')) {
            abort(404);
        }

        $response = new BinaryFileResponse($file, 200, [
            'Content-Type' => $type,
            // Nothing in an extension may be something else than what it says it is.
            'X-Content-Type-Options' => 'nosniff',
        ]);
        $response->setPublic()->setMaxAge(300)->setAutoEtag();

        return $response;
    }
}

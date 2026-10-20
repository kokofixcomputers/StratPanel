<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Theme\ThemeService;

/** The theme editor's side of the panel. Seeing and changing the theme is the permission of the branding settings. */
class ThemeController extends ClientApiController
{
    public function __construct(private ThemeService $theme)
    {
        parent::__construct();
    }

    public function show(): JsonResponse
    {
        return new JsonResponse(['config' => $this->theme->config(), 'css' => $this->theme->css()]);
    }

    public function update(Request $request): JsonResponse
    {
        $hex = ['regex:/^#[0-9a-fA-F]{6}$/'];
        $data = $request->validate([
            'config' => 'required|array',
            'config.accent' => ['required', 'string', ...$hex],
            'config.secondary' => ['nullable', 'string', ...$hex],
            'config.mode' => ['required', Rule::in(['system', 'light', 'dark'])],
            'config.radius' => ['required', Rule::in(['sharp', 'soft', 'round', 'pill'])],
            'config.buttons' => ['required', Rule::in(['default', 'pill', 'square'])],
            'config.shadow' => ['required', Rule::in(['none', 'soft', 'strong'])],
            'config.density' => ['required', Rule::in(['comfortable', 'compact'])],
            'config.font' => ['required', Rule::in(['inter', 'system', 'serif', 'mono'])],
            'config.layout' => ['required', Rule::in(['list', 'grid'])],
            'config.columns' => ['required', Rule::in([2, 3])],
            'config.glass' => 'required|integer|between:0,70',
            'config.glassBlur' => 'required|integer|between:0,30',
            'config.background' => 'required|array',
            'config.background.image' => 'nullable|string|max:500',
            'config.background.blur' => 'required|integer|between:0,40',
            'config.background.dim' => 'required|integer|between:0,90',
            'config.preset' => 'nullable|string|max:40',
            'css' => 'present|nullable|string|max:30000',
        ]);

        if (!ThemeService::imageAllowed($data['config']['background']['image'] ?? null)) {
            throw new DisplayException('That background picture address is not allowed, use an upload or an https address.');
        }

        try {
            $this->theme->save($data['config'], (string) ($data['css'] ?? ''));
        } catch (\InvalidArgumentException $exception) {
            throw new DisplayException($exception->getMessage());
        }

        Activity::event('admin:theme.update')->log();

        return $this->show();
    }

    public function destroy(): JsonResponse
    {
        $this->theme->reset();
        Activity::event('admin:theme.reset')->log();

        return new JsonResponse(['config' => null, 'css' => '']);
    }

    public function background(Request $request): JsonResponse
    {
        $request->validate(['image' => 'required|file|image|mimes:jpg,jpeg,png,webp,gif|max:8192']);

        return new JsonResponse(['url' => $this->theme->storeBackground($request->file('image'))]);
    }
}

<?php

namespace Pterodactyl\Services\Theme;

use Illuminate\Support\Str;
use Illuminate\Http\UploadedFile;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * The look of the panel an admin builds in the theme editor (a React page, resources/scripts/components/admin/ThemeEditor.tsx). What is kept
 * is the editor's settings (so the editor shows them again) and the CSS they make: a few blocks of CSS variables that the panel's styles
 * are written against. The CSS is made in the browser, so it is checked here before it is stored and again before it is printed into
 * every page: only variables, only on the root, nothing that can close a style tag or load a script.
 */
class ThemeService
{
    public const CONFIG = 'settings::theme:config';
    public const CSS = 'settings::theme:css';

    /** The folder, inside public, a background picture is put in (the favicon of the branding lives next to it). */
    private const DIRECTORY = 'branding';

    /** Where a background picture can come from: this panel, or any https address. */
    private const IMAGE = '#^(/branding/[A-Za-z0-9._-]{1,120}|https://[A-Za-z0-9._~:/?\#\[\]@!$&+,=%-]{1,450})$#';

    private const SELECTORS = ['html:root', 'html.dark'];

    public function __construct(private SettingsRepositoryInterface $settings)
    {
    }

    /** The settings of the editor, null when no theme was ever saved. @return array<string, mixed>|null */
    public function config(): ?array
    {
        $json = (string) $this->settings->get(self::CONFIG, '');
        $config = $json === '' ? null : json_decode($json, true);

        return is_array($config) ? $config : null;
    }

    /** The CSS that goes into every page, an empty string for the default look. */
    public function css(): string
    {
        $css = (string) $this->settings->get(self::CSS, '');

        return $this->sanitize($css) ?? '';
    }

    /** @param array<string, mixed> $config */
    public function save(array $config, string $css): void
    {
        $clean = $this->sanitize($css);
        if ($clean === null) {
            throw new \InvalidArgumentException('The theme holds something that is not allowed.');
        }

        $this->settings->set(self::CONFIG, json_encode($config, JSON_THROW_ON_ERROR));
        $this->settings->set(self::CSS, $clean);
    }

    /** Back to the default look. The uploaded background picture stays, it may be used again. */
    public function reset(): void
    {
        $this->settings->forget(self::CONFIG);
        $this->settings->forget(self::CSS);
    }

    /** Stores an uploaded picture and returns its address. */
    public function storeBackground(UploadedFile $file): string
    {
        $extension = 'jpg';
        foreach ([$file->guessExtension(), $file->getClientOriginalExtension()] as $candidate) {
            if (in_array(strtolower((string) $candidate), ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
                $extension = strtolower((string) $candidate);
                break;
            }
        }
        $name = 'background-' . substr(sha1_file($file->getRealPath()), 0, 12) . '.' . $extension;
        $file->move(public_path(self::DIRECTORY), $name);

        return '/' . self::DIRECTORY . '/' . $name;
    }

    public static function imageAllowed(?string $image): bool
    {
        // "gradient:aurora" is one of the gradients of the editor, the editor turns it into CSS.
        return $image === null || $image === '' || preg_match(self::IMAGE, $image) === 1 || preg_match('/^gradient:[a-z]{1,20}$/', $image) === 1;
    }

    /**
     * Returns the CSS written out in one clean form, or null when something in it is not allowed. Allowed: blocks for html:root and
     * html.dark that hold declarations of custom properties (--name: value;), nothing else.
     */
    public function sanitize(string $css): ?string
    {
        $css = trim($css);
        if ($css === '') {
            return '';
        }
        if (strlen($css) > 30000 || str_contains($css, '/*') || !preg_match_all('/([^{}]+)\{([^{}]*)\}/', $css, $blocks, PREG_SET_ORDER)) {
            return null;
        }
        // Everything must have been part of a block.
        if (trim((string) preg_replace('/([^{}]+)\{([^{}]*)\}/', '', $css)) !== '') {
            return null;
        }

        $out = [];
        foreach ($blocks as [, $selector, $body]) {
            $selector = trim($selector);
            if (!in_array($selector, self::SELECTORS, true)) {
                return null;
            }

            $lines = [];
            foreach (array_filter(array_map('trim', explode(';', $body)), fn ($d) => $d !== '') as $declaration) {
                if (!preg_match('/^(--[a-z0-9-]{1,40})\s*:\s*(.{1,600})$/s', $declaration, $m) || !$this->value(trim($m[2]))) {
                    return null;
                }
                $lines[] = '    ' . $m[1] . ': ' . trim($m[2]) . ';';
            }
            $out[] = $selector . " {\n" . implode("\n", $lines) . "\n}";
        }

        return implode("\n", $out);
    }

    private function value(string $value): bool
    {
        if (preg_match('/url\(\s*"([^"]*)"\s*\)/', $value, $m)) {
            // The one place an address is allowed is a whole url("...") of an allowed picture.
            return $value === $m[0] && preg_match(self::IMAGE, $m[1]) === 1;
        }

        // Quotes come in pairs, a stray one would swallow what follows it.
        if (substr_count($value, '"') % 2 !== 0 || substr_count($value, "'") % 2 !== 0) {
            return false;
        }

        return preg_match('/^[A-Za-z0-9 ._,%#()\/"\'+*-]*$/', $value) === 1 && !Str::contains(strtolower($value), ['url', 'expression', 'javascript', 'import']);
    }
}

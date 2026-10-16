<?php

namespace Pterodactyl\Extensions;

/**
 * The settings an extension declares in extension.json, turned into the rules the admin page checks them with and into what is
 * stored. The admin page is made from the same declaration, so an extension needs no page of its own to be set up.
 */
final class ExtensionSettings
{
    /** @return array<string, array<int, mixed>> */
    public static function rules(Manifest $manifest): array
    {
        $rules = [];
        foreach ($manifest->settings() as $setting) {
            $key = 'settings.' . $setting['key'];
            $rules[$key] = match ($setting['type']) {
                'boolean' => ['nullable', 'boolean'],
                'number' => array_filter([
                    'nullable',
                    'numeric',
                    isset($setting['min']) ? 'min:' . (float) $setting['min'] : null,
                    isset($setting['max']) ? 'max:' . (float) $setting['max'] : null,
                ]),
                'select' => ['nullable', 'in:' . implode(',', array_map('strval', array_keys(self::options($setting))))],
                'textarea' => ['nullable', 'string', 'max:' . min((int) ($setting['max_length'] ?? 5000), 20000)],
                default => ['nullable', 'string', 'max:' . min((int) ($setting['max_length'] ?? 500), 5000)],
            };
        }

        return $rules;
    }

    /**
     * The settings to store: what was sent, cast to the type they declare. A password that was left empty keeps what it was.
     *
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $current
     * @return array<string, mixed>
     */
    public static function normalize(Manifest $manifest, array $input, array $current): array
    {
        $result = [];
        foreach ($manifest->settings() as $setting) {
            $key = $setting['key'];
            $given = $input[$key] ?? null;

            $result[$key] = match ($setting['type']) {
                'boolean' => filter_var($given, FILTER_VALIDATE_BOOLEAN),
                'number' => is_numeric($given) ? $given + 0 : ($setting['default'] ?? 0),
                'password' => ($given === null || $given === '') ? ($current[$key] ?? ($setting['default'] ?? '')) : (string) $given,
                'select' => array_key_exists((string) $given, self::options($setting)) ? (string) $given : ($setting['default'] ?? ''),
                default => (string) ($given ?? ''),
            };
        }

        return $result;
    }

    /**
     * The choices of a select as value => label, whether the extension wrote a list or a map.
     *
     * @param  array<string, mixed>  $setting
     * @return array<string, string>
     */
    public static function options(array $setting): array
    {
        $options = [];
        foreach ((array) ($setting['options'] ?? []) as $key => $label) {
            $options[is_int($key) ? (string) $label : (string) $key] = (string) $label;
        }

        return $options;
    }
}

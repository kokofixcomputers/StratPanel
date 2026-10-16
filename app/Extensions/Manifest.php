<?php

namespace Pterodactyl\Extensions;

use Illuminate\Support\Facades\Validator;

/**
 * extension.json: what an extension is called, what it needs, what it adds and what an admin can set. Read when it is installed
 * and every time it is started, so everything in it is checked, nothing is believed.
 */
final class Manifest
{
    /** The version of the extension API this panel speaks. An extension names the one it was made for. */
    public const API = 1;

    public const SETTING_TYPES = ['text', 'textarea', 'number', 'boolean', 'select', 'password'];

    /** @param  array<string, mixed>  $data */
    private function __construct(private array $data)
    {
    }

    /**
     * @param  array<string, mixed>  $data
     *
     * @throws InvalidManifestException
     */
    public static function fromArray(array $data): self
    {
        $validator = Validator::make($data, [
            'api' => ['required', 'integer', 'min:1', 'max:' . self::API],
            'id' => ['required', 'string', 'regex:/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/'],
            'name' => 'required|string|max:100',
            'version' => ['required', 'string', 'max:40', 'regex:/^\d+\.\d+\.\d+([-+][0-9A-Za-z.\-+]*)?$/'],
            'description' => 'nullable|string|max:500',
            'author' => 'nullable|string|max:100',
            'homepage' => 'nullable|url|max:200',
            'license' => 'nullable|string|max:60',
            'php' => 'nullable|array',
            'php.main' => ['nullable', 'string', 'max:200', 'regex:/^[A-Za-z_][A-Za-z0-9_]*(\\\\[A-Za-z_][A-Za-z0-9_]*)*$/'],
            'php.autoload' => 'nullable|array|max:10',
            'web' => 'nullable|array',
            'web.scripts' => 'nullable|array|max:10',
            'web.scripts.*' => ['string', 'max:200', 'regex:/^web\/[A-Za-z0-9_.\-\/]+\.js$/'],
            'web.styles' => 'nullable|array|max:10',
            'web.styles.*' => ['string', 'max:200', 'regex:/^web\/[A-Za-z0-9_.\-\/]+\.css$/'],
            'migrations' => ['nullable', 'string', 'max:200', 'regex:/^[A-Za-z0-9_\-\/]+$/'],
            'settings' => 'nullable|array|max:50',
            'settings.*.key' => ['required', 'string', 'regex:/^[a-z][a-z0-9_]{0,39}$/'],
            'settings.*.label' => 'required|string|max:100',
            'settings.*.type' => ['required', 'in:' . implode(',', self::SETTING_TYPES)],
            'settings.*.help' => 'nullable|string|max:500',
            'settings.*.options' => 'nullable|array|max:50',
        ]);

        if ($validator->fails()) {
            throw new InvalidManifestException('extension.json is not valid: ' . implode(' ', $validator->errors()->all()));
        }

        // A script or a style is a file below web/, with no way up out of it.
        foreach (array_merge((array) ($data['web']['scripts'] ?? []), (array) ($data['web']['styles'] ?? [])) as $file) {
            if (!is_string($file) || !self::safeRelativePath($file) || str_contains($file, '//')) {
                throw new InvalidManifestException('extension.json is not valid: web.scripts and web.styles have to name files inside the web folder.');
            }
        }

        foreach ((array) ($data['php']['autoload'] ?? []) as $prefix => $directory) {
            if (!is_string($prefix) || !is_string($directory) || !preg_match('/^([A-Za-z_][A-Za-z0-9_]*\\\\)+$/', $prefix)
                || !self::safeRelativePath($directory)) {
                throw new InvalidManifestException('extension.json is not valid: php.autoload has to map a namespace that ends in \\ to a folder inside the extension.');
            }
        }
        if (isset($data['migrations']) && !self::safeRelativePath($data['migrations'])) {
            throw new InvalidManifestException('extension.json is not valid: migrations has to be a folder inside the extension.');
        }
        if (!empty($data['php']['main']) && empty($data['php']['autoload'])) {
            throw new InvalidManifestException('extension.json is not valid: php.main needs php.autoload to say where its classes are.');
        }

        $keys = [];
        foreach ((array) ($data['settings'] ?? []) as $setting) {
            if (isset($keys[$setting['key']])) {
                throw new InvalidManifestException('extension.json is not valid: the setting "' . $setting['key'] . '" is there twice.');
            }
            $keys[$setting['key']] = true;
            if ($setting['type'] === 'select' && empty($setting['options'])) {
                throw new InvalidManifestException('extension.json is not valid: the select "' . $setting['key'] . '" has no options.');
            }
        }

        return new self($data);
    }

    /** @throws InvalidManifestException */
    public static function fromJson(string $json): self
    {
        $data = json_decode($json, true);
        if (!is_array($data)) {
            throw new InvalidManifestException('extension.json is not valid JSON.');
        }

        return self::fromArray($data);
    }

    /** @throws InvalidManifestException */
    public static function fromDirectory(string $directory): self
    {
        $file = rtrim($directory, '/') . '/extension.json';
        $json = is_file($file) ? file_get_contents($file) : false;
        if ($json === false) {
            throw new InvalidManifestException('There is no extension.json.');
        }

        return self::fromJson($json);
    }

    /** A path that stays inside the extension: relative, with no way up. */
    public static function safeRelativePath(string $path): bool
    {
        return $path !== '' && !str_starts_with($path, '/') && !str_contains($path, '\\') && !str_contains($path, "\0")
            && !in_array('..', explode('/', $path), true);
    }

    public function id(): string
    {
        return $this->data['id'];
    }

    public function name(): string
    {
        return $this->data['name'];
    }

    public function version(): string
    {
        return $this->data['version'];
    }

    public function description(): string
    {
        return (string) ($this->data['description'] ?? '');
    }

    public function author(): string
    {
        return (string) ($this->data['author'] ?? '');
    }

    public function homepage(): ?string
    {
        return $this->data['homepage'] ?? null;
    }

    public function mainClass(): ?string
    {
        return $this->data['php']['main'] ?? null;
    }

    /** @return array<string, string> namespace prefix => folder */
    public function autoload(): array
    {
        return (array) ($this->data['php']['autoload'] ?? []);
    }

    /** @return list<string> */
    public function scripts(): array
    {
        return array_values((array) ($this->data['web']['scripts'] ?? []));
    }

    /** @return list<string> */
    public function styles(): array
    {
        return array_values((array) ($this->data['web']['styles'] ?? []));
    }

    public function migrations(): ?string
    {
        return $this->data['migrations'] ?? null;
    }

    /** @return list<array<string, mixed>> */
    public function settings(): array
    {
        return array_values((array) ($this->data['settings'] ?? []));
    }

    /** @return array<string, mixed> the defaults of the settings */
    public function defaults(): array
    {
        $defaults = [];
        foreach ($this->settings() as $setting) {
            $defaults[$setting['key']] = $setting['default'] ?? ($setting['type'] === 'boolean' ? false : ($setting['type'] === 'number' ? 0 : ''));
        }

        return $defaults;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->data;
    }
}

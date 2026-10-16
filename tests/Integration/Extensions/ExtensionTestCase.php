<?php

namespace Pterodactyl\Tests\Integration\Extensions;

use ZipArchive;
use Pterodactyl\Extensions\Hooks;
use Pterodactyl\Models\InstalledExtension;
use Pterodactyl\Extensions\ExtensionManager;
use Pterodactyl\Tests\Integration\IntegrationTestCase;

/** Gives every test of extensions a folder of its own to install into, and a way to make packages. */
abstract class ExtensionTestCase extends IntegrationTestCase
{
    protected string $directory;

    protected string $packages;

    public function setUp(): void
    {
        parent::setUp();

        Hooks::reset();
        $base = sys_get_temp_dir() . '/stratext-test-' . bin2hex(random_bytes(5));
        $this->directory = $base . '/extensions';
        $this->packages = $base . '/packages';
        mkdir($this->directory, 0755, true);
        mkdir($this->packages, 0755, true);
        config(['extensions.directory' => $this->directory, 'extensions.enabled' => true]);

        InstalledExtension::query()->delete();
        \DB::table('extension_data')->delete();
        $this->app->make(ExtensionManager::class)->restart();
    }

    public function tearDown(): void
    {
        Hooks::reset();
        InstalledExtension::query()->delete();
        \DB::table('extension_data')->delete();
        $this->removePath(dirname($this->directory));

        parent::tearDown();
    }

    protected function removePath(string $path): void
    {
        if (is_link($path) || is_file($path)) {
            @unlink($path);

            return;
        }
        foreach (is_dir($path) ? scandir($path) : [] as $entry) {
            if ($entry !== '.' && $entry !== '..') {
                $this->removePath($path . '/' . $entry);
            }
        }
        @rmdir($path);
    }

    protected function manager(): ExtensionManager
    {
        return $this->app->make(ExtensionManager::class);
    }

    /**
     * Makes a .stratext from files.
     *
     * @param  array<string, string>  $files  path => content
     */
    protected function package(array $files, string $name = 'test.stratext'): string
    {
        $path = $this->packages . '/' . $name;
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        foreach ($files as $file => $content) {
            if (str_ends_with($file, '/')) {
                $zip->addEmptyDir(rtrim($file, '/'));
            } else {
                $zip->addFromString($file, $content);
            }
        }
        $zip->close();

        return $path;
    }

    /** @param  array<string, mixed>  $patch */
    protected function manifest(string $id = 'sample', array $patch = []): string
    {
        return json_encode(array_replace_recursive([
            'api' => 1,
            'id' => $id,
            'name' => 'Sample',
            'version' => '1.0.0',
        ], $patch), JSON_UNESCAPED_SLASHES);
    }

    /** A package of an extension with a class, with the PHP of its main class in $body. */
    protected function phpExtension(string $id, string $class, string $body, array $manifest = [], array $files = []): string
    {
        // Classes stay declared for the rest of the run, so every package gets a namespace of its own.
        static $counter = 0;
        $namespace = 'TestExt\\' . $class . ++$counter;

        return $this->package(array_merge([
            'extension.json' => $this->manifest($id, array_replace_recursive([
                'php' => ['main' => $namespace . '\\Main', 'autoload' => [$namespace . '\\' => 'src/']],
            ], $manifest)),
            'src/Main.php' => "<?php\nnamespace $namespace;\nuse Pterodactyl\\Extensions\\Extension;\nclass Main extends Extension {\n$body\n}\n",
        ], $files), $id . '.stratext');
    }

    protected function install(string $package, bool $enable = true): InstalledExtension
    {
        $record = $this->app->make(\Pterodactyl\Extensions\ExtensionInstaller::class)->install($package, $enable, true);
        $this->manager()->restart();

        return $record;
    }
}

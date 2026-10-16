<?php

namespace Pterodactyl\Tests\Unit\Extensions;

use Pterodactyl\Tests\TestCase;
use Pterodactyl\Extensions\Manifest;
use Pterodactyl\Extensions\InvalidManifestException;

class ManifestTest extends TestCase
{
    /** @return array<string, mixed> */
    private function valid(array $patch = []): array
    {
        return array_replace_recursive([
            'api' => 1,
            'id' => 'sample-ext',
            'name' => 'Sample',
            'version' => '1.2.3',
        ], $patch);
    }

    public function testAMinimalManifestIsValid(): void
    {
        $manifest = Manifest::fromArray($this->valid());

        $this->assertSame('sample-ext', $manifest->id());
        $this->assertSame('Sample', $manifest->name());
        $this->assertSame('1.2.3', $manifest->version());
        $this->assertNull($manifest->mainClass());
        $this->assertSame([], $manifest->settings());
        $this->assertSame([], $manifest->scripts());
        $this->assertSame([], $manifest->defaults());
    }

    public function testAFullManifestIsRead(): void
    {
        $manifest = Manifest::fromArray($this->valid([
            'description' => 'It does things.',
            'author' => 'Me',
            'homepage' => 'https://example.com',
            'php' => ['main' => 'Vendor\\Ext\\Main', 'autoload' => ['Vendor\\Ext\\' => 'src/']],
            'web' => ['scripts' => ['web/index.js'], 'styles' => ['web/a/b.css']],
            'migrations' => 'database/migrations',
            'settings' => [
                ['key' => 'text', 'label' => 'T', 'type' => 'text', 'default' => 'x'],
                ['key' => 'flag', 'label' => 'F', 'type' => 'boolean'],
                ['key' => 'count', 'label' => 'C', 'type' => 'number', 'default' => 5],
                ['key' => 'pick', 'label' => 'P', 'type' => 'select', 'options' => ['a', 'b']],
            ],
        ]));

        $this->assertSame('Vendor\\Ext\\Main', $manifest->mainClass());
        $this->assertSame(['Vendor\\Ext\\' => 'src/'], $manifest->autoload());
        $this->assertSame(['web/index.js'], $manifest->scripts());
        $this->assertSame(['web/a/b.css'], $manifest->styles());
        $this->assertSame('database/migrations', $manifest->migrations());
        $this->assertSame(['text' => 'x', 'flag' => false, 'count' => 5, 'pick' => ''], $manifest->defaults());
    }

    /** @return array<string, array{array<string, mixed>}> */
    public static function invalid(): array
    {
        return [
            'no api' => [['api' => null]],
            'an api this panel does not have' => [['api' => 2]],
            'a version that is not a number' => [['version' => 'latest']],
            'two numbers only' => [['version' => '1.2']],
            'an id with capitals' => [['id' => 'Sample']],
            'an id that is too short' => [['id' => 'ab']],
            'an id with a dot' => [['id' => 'my.ext']],
            'an id that starts with a dash' => [['id' => '-abc']],
            'an id that tries to leave the folder' => [['id' => '../etc']],
            'no name' => [['name' => '']],
            'a homepage that is not an address' => [['homepage' => 'not a url']],
            'a main class that is not a class name' => [['php' => ['main' => 'a b', 'autoload' => ['A\\' => 'src/']]]],
            'a main class without autoload' => [['php' => ['main' => 'A\\Main']]],
            'an autoload folder that goes up' => [['php' => ['autoload' => ['A\\' => '../src/']]]],
            'an absolute autoload folder' => [['php' => ['autoload' => ['A\\' => '/etc/']]]],
            'a namespace without a closing slash' => [['php' => ['autoload' => ['A' => 'src/']]]],
            'a script outside web' => [['web' => ['scripts' => ['src/index.js']]]],
            'a script that goes up' => [['web' => ['scripts' => ['web/../x.js']]]],
            'a script that is not javascript' => [['web' => ['scripts' => ['web/index.php']]]],
            'an address instead of a script' => [['web' => ['scripts' => ['https://evil.example/x.js']]]],
            'a style that is not css' => [['web' => ['styles' => ['web/style.js']]]],
            'migrations that go up' => [['migrations' => '../database']],
            'an absolute migrations folder' => [['migrations' => '/tmp']],
            'a setting without a key' => [['settings' => [['label' => 'x', 'type' => 'text']]]],
            'a setting key with capitals' => [['settings' => [['key' => 'Bad', 'label' => 'x', 'type' => 'text']]]],
            'a setting of a type that does not exist' => [['settings' => [['key' => 'a', 'label' => 'x', 'type' => 'color']]]],
            'a select without options' => [['settings' => [['key' => 'a', 'label' => 'x', 'type' => 'select']]]],
            'the same setting twice' => [['settings' => [['key' => 'a', 'label' => 'x', 'type' => 'text'], ['key' => 'a', 'label' => 'y', 'type' => 'text']]]],
        ];
    }

    /** @dataProvider invalid */
    public function testManifestsThatAreNotValidAreRefused(array $patch): void
    {
        $data = $this->valid();
        foreach ($patch as $key => $value) {
            if ($value === null || $value === '') {
                unset($data[$key]);
                $value === '' && $data[$key] = '';
            } else {
                $data[$key] = $value;
            }
        }

        $this->expectException(InvalidManifestException::class);
        Manifest::fromArray($data);
    }

    public function testJsonThatIsBrokenIsRefused(): void
    {
        $this->expectException(InvalidManifestException::class);
        $this->expectExceptionMessage('not valid JSON');
        Manifest::fromJson('{ nope');
    }

    public function testAFolderWithoutAManifestIsRefused(): void
    {
        $this->expectException(InvalidManifestException::class);
        Manifest::fromDirectory(sys_get_temp_dir() . '/nothing-here-' . bin2hex(random_bytes(4)));
    }

    public function testSafeRelativePaths(): void
    {
        foreach (['web/index.js', 'a/b/c.php', 'src/'] as $good) {
            $this->assertTrue(Manifest::safeRelativePath($good), $good);
        }
        foreach (['', '/etc/passwd', '../x', 'a/../../x', 'a/..', 'a\\b', "a\0b"] as $bad) {
            $this->assertFalse(Manifest::safeRelativePath($bad), json_encode($bad));
        }
    }
}

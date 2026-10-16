<?php

namespace Pterodactyl\Tests\Integration\Extensions;

use Pterodactyl\Models\InstalledExtension;
use Pterodactyl\Extensions\ExtensionInstaller;
use Pterodactyl\Extensions\InvalidManifestException;

class InstallerTest extends ExtensionTestCase
{
    private function installer(): ExtensionInstaller
    {
        return $this->app->make(ExtensionInstaller::class);
    }

    private function simple(array $extra = [], string $name = 'sample.stratext'): string
    {
        return $this->package(array_merge(['extension.json' => $this->manifest('sample')], $extra), $name);
    }

    public function testAPackageIsUnpackedAndRecordedAndOffUntilSwitchedOn(): void
    {
        $record = $this->installer()->install($this->simple(['readme.txt' => 'hi', 'src/deep/file.txt' => 'x']));

        $this->assertSame('sample', $record->ext_id);
        $this->assertSame('1.0.0', $record->version);
        $this->assertFalse($record->enabled);
        $this->assertSame('hi', file_get_contents($this->directory . '/sample/readme.txt'));
        $this->assertSame('x', file_get_contents($this->directory . '/sample/src/deep/file.txt'));
    }

    public function testItCanBeSwitchedOnWhenInstalled(): void
    {
        $this->assertTrue($this->installer()->install($this->simple(), true)->enabled);
    }

    public function testNothingIsLeftBehindInTheFolderExceptTheExtension(): void
    {
        $this->installer()->install($this->simple());

        $this->assertSame(['sample'], array_values(array_diff(scandir($this->directory), ['.', '..'])));
    }

    public function testInspectingReadsTheManifestAndInstallsNothing(): void
    {
        $manifest = $this->installer()->inspect($this->simple());

        $this->assertSame('sample', $manifest->id());
        $this->assertFalse(is_dir($this->directory . '/sample'));
        $this->assertSame(0, InstalledExtension::query()->count());
    }

    public function testAnExtensionThatIsInstalledIsNotReplacedWithoutSayingSo(): void
    {
        $this->installer()->install($this->simple(['v.txt' => '1']));

        try {
            $this->installer()->install($this->simple(['v.txt' => '2']));
            $this->fail('Expected an exception');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('installed already', $exception->getMessage());
        }
        $this->assertSame('1', file_get_contents($this->directory . '/sample/v.txt'));
    }

    public function testReplacingKeepsTheSettingsTheStateAndTheData(): void
    {
        $record = $this->installer()->install($this->simple(['v.txt' => '1', 'old.txt' => 'gone']), true);
        $record->forceFill(['settings' => ['a' => 'b'], 'last_error' => 'old problem', 'last_error_at' => now()])->save();
        (new \Pterodactyl\Extensions\ExtensionStore('sample'))->put('k', 'v');

        $package = $this->package([
            'extension.json' => $this->manifest('sample', ['version' => '1.1.0', 'name' => 'Sample 2']),
            'v.txt' => '2',
        ], 'new.stratext');
        $updated = $this->installer()->install($package, false, true);

        $this->assertSame('1.1.0', $updated->version);
        $this->assertSame('Sample 2', $updated->name);
        $this->assertTrue($updated->enabled, 'an update does not switch it off');
        $this->assertSame(['a' => 'b'], $updated->settings);
        $this->assertNull($updated->last_error, 'the old problem is not the new one');
        $this->assertSame('2', file_get_contents($this->directory . '/sample/v.txt'));
        $this->assertFileDoesNotExist($this->directory . '/sample/old.txt');
        $this->assertSame('v', (new \Pterodactyl\Extensions\ExtensionStore('sample'))->get('k'));
        $this->assertSame(['sample'], array_values(array_diff(scandir($this->directory), ['.', '..'])));
    }

    public function testAPackageThatIsZippedAsAFolderIsUnpackedAtItsTop(): void
    {
        $record = $this->installer()->install($this->package([
            'my-folder/' => '',
            'my-folder/extension.json' => $this->manifest('sample'),
            'my-folder/src/a.txt' => 'a',
            '__MACOSX/my-folder/._extension.json' => 'junk',
            'my-folder/.DS_Store' => 'junk',
        ]));

        $this->assertSame('sample', $record->ext_id);
        $this->assertSame('a', file_get_contents($this->directory . '/sample/src/a.txt'));
        $this->assertFileExists($this->directory . '/sample/extension.json');
        $this->assertFileDoesNotExist($this->directory . '/sample/.DS_Store');
        $this->assertDirectoryDoesNotExist($this->directory . '/sample/__MACOSX');
    }

    /** @return array<string, array{string, string}> */
    public static function dangerousNames(): array
    {
        return [
            'a way up' => ['../escape.txt', 'not allowed'],
            'a way up in the middle' => ['a/../../escape.txt', 'not allowed'],
            'an absolute path' => ['/tmp/escape.txt', 'not allowed'],
            'backslashes' => ['a\\..\\escape.txt', 'not allowed'],
            'a drive' => ['C:evil.txt', 'not allowed'],
        ];
    }

    /** @dataProvider dangerousNames */
    public function testAPackageThatTriesToWriteOutsideItsFolderIsRefusedBeforeAnythingIsWritten(string $name): void
    {
        $package = $this->simple([$name => 'evil']);

        try {
            $this->installer()->install($package);
            $this->fail('Expected an exception');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('not allowed', $exception->getMessage());
        }

        $this->assertFileDoesNotExist(dirname($this->directory) . '/escape.txt');
        $this->assertFileDoesNotExist('/tmp/escape.txt');
        $this->assertSame(0, InstalledExtension::query()->count());
        $this->assertSame([], array_values(array_diff(scandir($this->directory), ['.', '..'])));
    }

    public function testAPackageWithALinkIsRefused(): void
    {
        $path = $this->packages . '/link.stratext';
        $zip = new \ZipArchive();
        $zip->open($path, \ZipArchive::CREATE);
        $zip->addFromString('extension.json', $this->manifest('sample'));
        $zip->addFromString('link', '/etc/passwd');
        // The attribute that says this entry is a symbolic link, which is how an archive carries one.
        $zip->setExternalAttributesName('link', \ZipArchive::OPSYS_UNIX, 0120777 << 16);
        $zip->close();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('link');
        $this->installer()->install($path);
    }

    public function testAPackageWithoutAManifestIsRefused(): void
    {
        $this->expectException(InvalidManifestException::class);
        $this->expectExceptionMessage('no extension.json');
        $this->installer()->install($this->package(['readme.txt' => 'x']));
    }

    public function testAManifestThatIsNotValidIsRefusedAndNothingIsInstalled(): void
    {
        try {
            $this->installer()->install($this->package(['extension.json' => $this->manifest('Bad Id')]));
            $this->fail('Expected an exception');
        } catch (InvalidManifestException) {
        }

        $this->assertSame(0, InstalledExtension::query()->count());
        $this->assertSame([], array_values(array_diff(scandir($this->directory), ['.', '..'])));
    }

    public function testAScriptThatIsNamedButNotThereIsRefused(): void
    {
        $this->expectException(InvalidManifestException::class);
        $this->expectExceptionMessage('web/index.js');
        $this->installer()->install($this->package(['extension.json' => $this->manifest('sample', ['web' => ['scripts' => ['web/index.js']]])]));
    }

    public function testSomethingThatIsNotAZipIsRefused(): void
    {
        $path = $this->packages . '/fake.stratext';
        file_put_contents($path, 'this is not a zip file');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('not a .stratext');
        $this->installer()->install($path);
    }

    public function testAFileThatIsNotThereIsRefused(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->installer()->install($this->packages . '/missing.stratext');
    }

    public function testAPackageWithTooManyFilesIsRefused(): void
    {
        config(['extensions.max_files' => 3]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('between 1 and 3');
        $this->installer()->install($this->simple(['a' => '1', 'b' => '2', 'c' => '3']));
    }

    public function testAPackageThatIsTooBigWhenUnpackedIsRefused(): void
    {
        config(['extensions.max_unpacked_bytes' => 1000]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('when it is unpacked');
        // Zips squeeze repeated text a lot, this is a small file that is 5000 bytes unpacked.
        $this->installer()->install($this->simple(['big.txt' => str_repeat('a', 5000)]));
    }

    public function testAPackageThatIsTooBigIsRefused(): void
    {
        config(['extensions.max_package_bytes' => 10]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('bigger than');
        $this->installer()->install($this->simple());
    }

    public function testMigrationsOfTheExtensionAreRun(): void
    {
        $table = 'ext_test_' . bin2hex(random_bytes(3));
        $migration = "<?php\nuse Illuminate\\Database\\Migrations\\Migration;\nuse Illuminate\\Database\\Schema\\Blueprint;\nuse Illuminate\\Support\\Facades\\Schema;\n"
            . "return new class extends Migration {\n public function up(): void { Schema::create('$table', function (Blueprint \$t) { \$t->increments('id'); }); }\n"
            . " public function down(): void { Schema::dropIfExists('$table'); }\n};\n";

        try {
            $this->installer()->install($this->package([
                'extension.json' => $this->manifest('sample', ['migrations' => 'database/migrations']),
                'database/migrations/2026_01_01_000000_create_it.php' => $migration,
            ]));

            $this->assertTrue(\Schema::hasTable($table));
        } finally {
            \Schema::dropIfExists($table);
            \DB::table('migrations')->where('migration', '2026_01_01_000000_create_it')->delete();
        }
    }

    public function testMigrationsThatFailLeaveNothingInstalled(): void
    {
        $broken = "<?php\nuse Illuminate\\Database\\Migrations\\Migration;\nreturn new class extends Migration {\n public function up(): void { throw new \\RuntimeException('no table for you'); }\n};\n";

        try {
            $this->installer()->install($this->package([
                'extension.json' => $this->manifest('sample', ['migrations' => 'database/migrations']),
                'database/migrations/2026_01_01_000001_broken.php' => $broken,
            ]));
            $this->fail('Expected an exception');
        } catch (\Throwable $exception) {
            $this->assertStringContainsString('database changes', $exception->getMessage());
            $this->assertStringContainsString('no table for you', $exception->getMessage());
        }

        $this->assertSame(0, InstalledExtension::query()->count());
        $this->assertSame([], array_values(array_diff(scandir($this->directory), ['.', '..'])));
    }

    public function testRemovingDeletesTheFilesAndTheRecord(): void
    {
        $this->installer()->install($this->simple(['a/b.txt' => 'x']), true);
        (new \Pterodactyl\Extensions\ExtensionStore('sample'))->put('k', 'v');

        $this->installer()->remove('sample');

        $this->assertDirectoryDoesNotExist($this->directory . '/sample');
        $this->assertSame(0, InstalledExtension::query()->count());
        // What it stored stays, for a reinstall, unless it is purged.
        $this->assertSame('v', (new \Pterodactyl\Extensions\ExtensionStore('sample'))->get('k'));
    }

    public function testPurgingAlsoDeletesWhatItStored(): void
    {
        $this->installer()->install($this->simple());
        (new \Pterodactyl\Extensions\ExtensionStore('sample'))->put('k', 'v');

        $this->installer()->remove('sample', true);

        $this->assertNull((new \Pterodactyl\Extensions\ExtensionStore('sample'))->get('k'));
    }

    public function testRemovingDoesNotFollowALinkInsideTheFolder(): void
    {
        $this->installer()->install($this->simple());
        $outside = dirname($this->directory) . '/outside';
        mkdir($outside);
        file_put_contents($outside . '/precious.txt', 'keep');
        symlink($outside, $this->directory . '/sample/link');

        $this->installer()->remove('sample');

        $this->assertFileExists($outside . '/precious.txt');
    }

    public function testRemovingSomethingThatIsNotInstalledOrNotAnIdIsAnError(): void
    {
        foreach (['not-installed', '../etc', 'A B', ''] as $id) {
            try {
                $this->installer()->remove($id);
                $this->fail('Expected an exception for ' . json_encode($id));
            } catch (\RuntimeException) {
                $this->assertTrue(true);
            }
        }
    }
}

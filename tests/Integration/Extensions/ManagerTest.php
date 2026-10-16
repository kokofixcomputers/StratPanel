<?php

namespace Pterodactyl\Tests\Integration\Extensions;

use Pterodactyl\Extensions\Hooks;
use Pterodactyl\Models\InstalledExtension;

class ManagerTest extends ExtensionTestCase
{
    private function record(string $id): InstalledExtension
    {
        return InstalledExtension::query()->where('ext_id', $id)->firstOrFail();
    }

    public function testAnExtensionThatIsOnIsStartedAndItsHooksWork(): void
    {
        $this->install($this->phpExtension('good-one', 'GoodOne', '
            public function register(): void { $this->context->filter("test.value", fn ($v) => $v . "+good"); }
        '));

        $this->assertTrue($this->manager()->isRunning('good-one'));
        $this->assertSame('x+good', Hooks::filter('test.value', 'x'));
        $this->assertNull($this->record('good-one')->last_error);
    }

    public function testAnExtensionThatIsOffIsNotStarted(): void
    {
        $this->install($this->phpExtension('quiet-one', 'QuietOne', '
            public function register(): void { $this->context->filter("test.value", fn ($v) => $v . "+quiet"); }
        '), false);

        $this->assertFalse($this->manager()->isRunning('quiet-one'));
        $this->assertSame('x', Hooks::filter('test.value', 'x'));
    }

    public function testSafeModeStartsNothing(): void
    {
        $this->install($this->phpExtension('good-one', 'GoodTwo', '
            public function register(): void { $this->context->filter("test.value", fn ($v) => $v . "+good"); }
        '));
        config(['extensions.enabled' => false]);
        Hooks::reset();

        $this->manager()->restart();

        $this->assertSame([], $this->manager()->running());
        $this->assertSame('x', Hooks::filter('test.value', 'x'));
    }

    /** @return array<string, array{string, string}> what the main class does, and what the admin is told */
    public static function failures(): array
    {
        return [
            'an exception in register' => ['public function boot(): void { throw new \RuntimeException("register broke"); }', 'register broke'],
            'an exception in boot' => ['public function boot(): void { throw new \LogicException("boot broke"); }', 'boot broke'],
            'an error (not an exception)' => ['public function boot(): void { $x = null; $x->nothing(); }', 'member function'],
            'a type error' => ['public function boot(): void { strlen([]); }', 'must be of type'],
            'a division by zero' => ['public function boot(): void { echo 1 % 0; }', 'zero'],
        ];
    }

    /** @dataProvider failures */
    public function testAnExtensionThatBreaksWhileStartingIsLeftOutAndTheOthersStart(string $body, string $expected): void
    {
        $this->install($this->phpExtension('before-one', 'Before', '
            public function register(): void { $this->context->filter("test.value", fn ($v) => $v . "+before"); }
        '));
        $this->install($this->phpExtension('broken-one', 'Broken', '
            public function register(): void { $this->context->filter("test.value", fn ($v) => $v . "+broken"); }
        ' . $body));
        $this->install($this->phpExtension('after-one', 'After', '
            public function register(): void { $this->context->filter("test.value", fn ($v) => $v . "+after"); }
        '));

        $this->assertTrue($this->manager()->isRunning('before-one'));
        $this->assertTrue($this->manager()->isRunning('after-one'));
        $this->assertFalse($this->manager()->isRunning('broken-one'));
        $this->assertArrayHasKey('broken-one', $this->manager()->failed());
        // Whatever the broken one had hooked is gone, the others work.
        $this->assertSame('x+before+after', Hooks::filter('test.value', 'x'));
        $this->assertStringNotContainsString('broken', Hooks::filter('test.value', 'x'));

        $record = $this->record('broken-one');
        $this->assertTrue($record->enabled, 'it stays on, the admin decides');
        $this->assertStringContainsStringIgnoringCase($expected, (string) $record->last_error);
        $this->assertNotNull($record->last_error_at);
    }

    public function testAnExtensionThatKilledTheProcessWhileStartingIsTurnedOff(): void
    {
        $this->install($this->phpExtension('deadly-one', 'Deadly', '
            public function register(): void { $this->context->filter("test.value", fn ($v) => $v . "+deadly"); }
        '));
        // What a fatal error leaves behind: the note, and nobody holding it.
        file_put_contents($this->directory . '/.starting-deadly-one', 'starting');
        $this->manager()->restart();

        $this->assertFalse($this->manager()->isRunning('deadly-one'));
        $this->assertSame('x', Hooks::filter('test.value', 'x'));
        $record = $this->record('deadly-one');
        $this->assertFalse($record->enabled);
        $this->assertStringContainsString('crashed', (string) $record->last_error);
        $this->assertFileDoesNotExist($this->directory . '/.starting-deadly-one');
    }

    public function testTheNoteIsClearedAfterAGoodStart(): void
    {
        $this->install($this->phpExtension('fine-one', 'Fine', ''));

        $this->assertTrue($this->manager()->isRunning('fine-one'));
        $this->assertSame('', trim((string) @file_get_contents($this->directory . '/.starting-fine-one')));
        $this->manager()->restart();
        $this->assertTrue($this->manager()->isRunning('fine-one'));
    }

    public function testASyntaxErrorInTheMainClassIsCaught(): void
    {
        $this->install($this->phpExtension('syntax-one', 'Syntax', 'public function boot(): void { this is not php }'));

        $this->assertFalse($this->manager()->isRunning('syntax-one'));
        $this->assertStringContainsStringIgnoringCase('syntax', (string) $this->record('syntax-one')->last_error);
    }

    public function testAMainClassThatDoesNotExistIsCaught(): void
    {
        $this->install($this->package([
            'extension.json' => $this->manifest('lost-one', ['php' => ['main' => 'Nowhere\\Main', 'autoload' => ['Nowhere\\' => 'src/']]]),
            'src/Other.php' => '<?php namespace Nowhere; class Other {}',
        ]));

        $this->assertFalse($this->manager()->isRunning('lost-one'));
        $this->assertStringContainsString('Nowhere\\Main', (string) $this->record('lost-one')->last_error);
    }

    public function testAMainClassThatIsNotAnExtensionIsCaught(): void
    {
        $this->install($this->package([
            'extension.json' => $this->manifest('wrong-one', ['php' => ['main' => 'WrongKind\\Main', 'autoload' => ['WrongKind\\' => 'src/']]]),
            'src/Main.php' => '<?php namespace WrongKind; class Main {}',
        ]));

        $this->assertFalse($this->manager()->isRunning('wrong-one'));
        $this->assertStringContainsString('has to extend', (string) $this->record('wrong-one')->last_error);
    }

    public function testFilesThatAreGoneAreCaught(): void
    {
        $this->install($this->phpExtension('gone-one', 'Gone', ''));
        $this->removePath($this->directory . '/gone-one');
        $this->manager()->restart();

        $this->assertFalse($this->manager()->isRunning('gone-one'));
        $this->assertStringContainsString('extension.json', (string) $this->record('gone-one')->last_error);
    }

    public function testAManifestThatWasDamagedAfterInstallingIsCaught(): void
    {
        $this->install($this->phpExtension('damaged-one', 'Damaged', ''));
        file_put_contents($this->directory . '/damaged-one/extension.json', '{ broken');
        $this->manager()->restart();

        $this->assertFalse($this->manager()->isRunning('damaged-one'));
        $this->assertNotNull($this->record('damaged-one')->last_error);
    }

    public function testAFolderThatBelongsToAnotherExtensionIsNotStarted(): void
    {
        $this->install($this->phpExtension('real-one', 'RealOne', ''));
        // Somebody swapped in the files of another extension.
        file_put_contents($this->directory . '/real-one/extension.json', $this->manifest('other-one'));
        $this->manager()->restart();

        $this->assertFalse($this->manager()->isRunning('real-one'));
        $this->assertStringContainsString('other-one', (string) $this->record('real-one')->last_error);
    }

    public function testTheSettingsReachTheExtensionOverTheDefaults(): void
    {
        $this->install($this->phpExtension('set-one', 'SetOne', '
            public function register(): void { $this->context->filter("test.value", fn ($v) => $v . $this->context->setting("word") . $this->context->setting("other", "?")); }
        ', ['settings' => [
            ['key' => 'word', 'label' => 'W', 'type' => 'text', 'default' => 'default'],
            ['key' => 'other', 'label' => 'O', 'type' => 'text', 'default' => 'dflt'],
        ]]));
        $this->assertSame('x:defaultdflt', Hooks::filter('test.value', 'x:'));

        $this->record('set-one')->forceFill(['settings' => ['word' => 'chosen']])->save();
        Hooks::reset();
        $this->manager()->restart();

        $this->assertSame('x:chosendflt', Hooks::filter('test.value', 'x:'));
    }

    public function testTheErrorIsNotWrittenAgainAndAgainForTheSameProblem(): void
    {
        $this->install($this->phpExtension('noisy-one', 'Noisy', 'public function boot(): void { throw new \RuntimeException("same problem"); }'));
        $first = $this->record('noisy-one')->last_error_at;
        $this->assertNotNull($first);

        \Carbon\Carbon::setTestNow(now()->addSeconds(30));
        $this->manager()->restart();
        $this->manager()->restart();

        $this->assertEquals($first->timestamp, $this->record('noisy-one')->last_error_at->timestamp);
        \Carbon\Carbon::setTestNow();
    }

    public function testAHookThatBreaksIsRecordedAndTheValueStaysWhole(): void
    {
        $this->install($this->phpExtension('hooky-one', 'Hooky', '
            public function register(): void { $this->context->filter("test.value", function ($v) { throw new \RuntimeException("hook broke"); }); }
        '));
        $this->assertTrue($this->manager()->isRunning('hooky-one'));

        $this->assertSame('x', Hooks::filter('test.value', 'x'));

        $this->assertStringContainsString('hook broke', (string) $this->record('hooky-one')->last_error);
        $this->assertStringContainsString('test.value', (string) $this->record('hooky-one')->last_error);
    }

    public function testTheFrontendListHasOnlyWhatStartedAndHasABrowserPart(): void
    {
        $this->install($this->phpExtension('web-one', 'WebOne', '', ['web' => ['scripts' => ['web/index.js'], 'styles' => ['web/a/style.css']]], [
            'web/index.js' => '1', 'web/a/style.css' => '2',
        ]));
        $this->install($this->phpExtension('plain-one', 'PlainOne', ''));
        $this->install($this->phpExtension('web-broken', 'WebBroken', 'public function boot(): void { throw new \RuntimeException("x"); }', ['web' => ['scripts' => ['web/index.js']]], ['web/index.js' => '1']));

        $this->assertSame([[
            'id' => 'web-one',
            'name' => 'Sample',
            'version' => '1.0.0',
            'scripts' => ['/extensions/web-one/assets/index.js?v=1.0.0'],
            'styles' => ['/extensions/web-one/assets/a/style.css?v=1.0.0'],
        ]], $this->manager()->frontend());
    }

    public function testExtensionsDoNotSeeFilesOutsideTheirFolderThroughTheAutoloader(): void
    {
        $this->install($this->package([
            'extension.json' => $this->manifest('loader-one', ['php' => ['main' => 'LoaderOne\\Main', 'autoload' => ['LoaderOne\\' => 'src/']]]),
            'src/Main.php' => '<?php namespace LoaderOne; use Pterodactyl\Extensions\Extension; class Main extends Extension { public function boot(): void { class_exists(\'LoaderOne\\\\..\\\\..\\\\Escaped\'); } }',
        ]));
        file_put_contents($this->directory . '/loader-one/Escaped.php', '<?php throw new \Exception("escaped");');

        $this->manager()->restart();

        $this->assertTrue($this->manager()->isRunning('loader-one'));
    }
}

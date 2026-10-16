<?php

namespace Pterodactyl\Tests\Integration\Extensions;

use Pterodactyl\Models\InstalledExtension;

class CommandsTest extends ExtensionTestCase
{
    private function sample(string $version = '1.0.0', string $name = 'sample.stratext'): string
    {
        return $this->package(['extension.json' => $this->manifest('sample', ['version' => $version, 'description' => 'It samples.'])], $name);
    }

    public function testInstallShowsWhatItIsAndInstallsOff(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true])
            ->expectsOutputToContain('Sample 1.0.0 (sample)')
            ->expectsOutputToContain('It samples.')
            ->expectsOutputToContain('is installed.')
            ->assertExitCode(0);

        $this->assertFalse(InstalledExtension::query()->firstOrFail()->enabled);
    }

    public function testInstallCanSwitchItOn(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true, '--enable' => true])
            ->expectsOutputToContain('is installed and on.')
            ->assertExitCode(0);

        $this->assertTrue(InstalledExtension::query()->firstOrFail()->enabled);
    }

    public function testInstallAsksFirstAndNothingHappensWhenTheAnswerIsNo(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample()])
            ->expectsConfirmation('Install Sample?', 'no')
            ->expectsOutputToContain('Nothing was installed.')
            ->assertExitCode(0);

        $this->assertSame(0, InstalledExtension::query()->count());
    }

    public function testInstallWarnsThatAnExtensionHasFullAccess(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true])
            ->expectsOutputToContain('same access to everything')
            ->assertExitCode(0);
    }

    public function testInstallSaysWhyItFailed(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->package(['readme.txt' => 'x']), '--yes' => true])
            ->expectsOutputToContain('no extension.json')
            ->assertExitCode(1);

        $this->artisan('p:extension:install', ['file' => '/nowhere/x.stratext', '--yes' => true])
            ->expectsOutputToContain('does not exist')
            ->assertExitCode(1);
    }

    public function testInstallingAgainNeedsForceAndForceKeepsTheState(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true, '--enable' => true])->assertExitCode(0);

        $this->artisan('p:extension:install', ['file' => $this->sample('1.1.0', 'b.stratext'), '--yes' => true])
            ->expectsOutputToContain('installed already')
            ->assertExitCode(1);

        $this->artisan('p:extension:install', ['file' => $this->sample('1.1.0', 'b.stratext'), '--yes' => true, '--force' => true])->assertExitCode(0);

        $record = InstalledExtension::query()->firstOrFail();
        $this->assertSame('1.1.0', $record->version);
        $this->assertTrue($record->enabled);
    }

    public function testListShowsTheStates(): void
    {
        $this->artisan('p:extension:list')->expectsOutputToContain('No extensions are installed.')->assertExitCode(0);

        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true]);
        $this->artisan('p:extension:list')->expectsTable(['Id', 'Name', 'Version', 'State', 'Last error'], [['sample', 'Sample', '1.0.0', 'off', '']])->assertExitCode(0);

        InstalledExtension::query()->update(['enabled' => true, 'last_error' => 'it broke']);
        $this->artisan('p:extension:list')->expectsTable(['Id', 'Name', 'Version', 'State', 'Last error'], [['sample', 'Sample', '1.0.0', 'on, with an error', 'it broke']])->assertExitCode(0);
    }

    public function testEnableAndDisable(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true]);

        $this->artisan('p:extension:enable', ['id' => 'sample'])->expectsOutputToContain('is on.')->assertExitCode(0);
        $this->assertTrue(InstalledExtension::query()->firstOrFail()->enabled);

        $this->artisan('p:extension:disable', ['id' => 'sample'])->expectsOutputToContain('is off.')->assertExitCode(0);
        $this->assertFalse(InstalledExtension::query()->firstOrFail()->enabled);

        $this->artisan('p:extension:enable', ['id' => 'nothing'])->expectsOutputToContain('not installed')->assertExitCode(1);
    }

    public function testEnablingForgetsTheOldError(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true]);
        InstalledExtension::query()->update(['last_error' => 'old', 'last_error_at' => now()]);

        $this->artisan('p:extension:enable', ['id' => 'sample'])->assertExitCode(0);

        $this->assertNull(InstalledExtension::query()->firstOrFail()->last_error);
    }

    public function testDisablingWorksWhenTheFilesAreGone(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true, '--enable' => true]);
        $this->removePath($this->directory . '/sample');

        $this->artisan('p:extension:disable', ['id' => 'sample'])->assertExitCode(0);

        $this->assertFalse(InstalledExtension::query()->firstOrFail()->enabled);
    }

    public function testRemove(): void
    {
        $this->artisan('p:extension:install', ['file' => $this->sample(), '--yes' => true]);

        $this->artisan('p:extension:remove', ['id' => 'sample', '--yes' => true])->expectsOutputToContain('Removed.')->assertExitCode(0);

        $this->assertSame(0, InstalledExtension::query()->count());
        $this->assertDirectoryDoesNotExist($this->directory . '/sample');
        $this->artisan('p:extension:remove', ['id' => 'sample', '--yes' => true])->expectsOutputToContain('not installed')->assertExitCode(1);
    }
}

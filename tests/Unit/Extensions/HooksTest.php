<?php

namespace Pterodactyl\Tests\Unit\Extensions;

use Pterodactyl\Tests\TestCase;
use Pterodactyl\Extensions\Hooks;

class HooksTest extends TestCase
{
    public function setUp(): void
    {
        parent::setUp();
        Hooks::reset();
    }

    public function tearDown(): void
    {
        Hooks::reset();
        parent::tearDown();
    }

    public function testAFilterWithoutListenersReturnsTheValue(): void
    {
        $this->assertSame(['a' => 1], Hooks::filter('nothing', ['a' => 1]));
    }

    public function testListenersChangeTheValueOneAfterTheOther(): void
    {
        Hooks::listen('x', fn (array $v) => $v + ['b' => 2], 'one');
        Hooks::listen('x', fn (array $v) => $v + ['c' => count($v)], 'two');

        $this->assertSame(['a' => 1, 'b' => 2, 'c' => 2], Hooks::filter('x', ['a' => 1]));
    }

    public function testPriorityDecidesTheOrder(): void
    {
        Hooks::listen('x', fn (string $v) => $v . 'B', 'one', 20);
        Hooks::listen('x', fn (string $v) => $v . 'A', 'two', 5);
        Hooks::listen('x', fn (string $v) => $v . 'C', 'three', 20);

        $this->assertSame('-ABC', Hooks::filter('x', '-'));
    }

    public function testExtraArgumentsAreGivenToEveryone(): void
    {
        Hooks::listen('x', fn ($v, $one, $two) => $v . $one . $two, 'one');

        $this->assertSame('v12', Hooks::filter('x', 'v', 1, 2));
    }

    public function testAListenerThatReturnsNothingLeavesTheValueAlone(): void
    {
        Hooks::listen('x', function ($value) {
            // forgot to return
        }, 'one');

        $this->assertSame('same', Hooks::filter('x', 'same'));
    }

    public function testAListenerThatThrowsIsSkippedAndTheOthersStillRun(): void
    {
        Hooks::listen('x', fn ($v) => $v . 'A', 'one');
        Hooks::listen('x', function () {
            throw new \RuntimeException('broken');
        }, 'two');
        Hooks::listen('x', fn ($v) => $v . 'C', 'three');

        $this->assertSame('-AC', Hooks::filter('x', '-'));
    }

    public function testAListenerCannotChangeTheKindOfValue(): void
    {
        Hooks::listen('x', fn ($v) => 'a string where an array was', 'one');
        Hooks::listen('x', fn (array $v) => $v + ['kept' => true], 'two');

        $this->assertSame(['a' => 1, 'kept' => true], Hooks::filter('x', ['a' => 1]));
    }

    public function testNumbersMayBeIntegersOrFloats(): void
    {
        Hooks::listen('x', fn ($v) => $v * 1.5, 'one');

        $this->assertSame(3.0, Hooks::filter('x', 2));
    }

    public function testActionsRunEveryListenerEvenWhenOneThrows(): void
    {
        $seen = [];
        Hooks::listen('a', function () use (&$seen) {
            $seen[] = 1;
        }, 'one');
        Hooks::listen('a', function () {
            throw new \RuntimeException('no');
        }, 'two');
        Hooks::listen('a', function ($arg) use (&$seen) {
            $seen[] = $arg;
        }, 'three');

        Hooks::fire('a', 'x');

        $this->assertSame([1, 'x'], $seen);
    }

    public function testWhatAnExtensionListenedToCanBeTakenAway(): void
    {
        Hooks::listen('x', fn ($v) => $v . 'A', 'one');
        Hooks::listen('x', fn ($v) => $v . 'B', 'two');

        Hooks::forget('one');

        $this->assertSame('-B', Hooks::filter('x', '-'));
        $this->assertTrue(Hooks::has('x'));
    }
}

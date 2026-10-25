<?php

namespace Pterodactyl\Services\Servers\AutoSleep;

use Carbon\CarbonImmutable;
use Pterodactyl\Models\Server;
use Pterodactyl\Facades\Activity;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\ServerDomain;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\ServerAutoSleep;
use Pterodactyl\Repositories\Wings\DaemonPowerRepository;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

/**
 * Auto sleep: a server that nobody has been on for a while is stopped to give back its memory, and started again when a
 * player tries to join through the router (see tools/stratnet/router). It is off for every server until the owner turns it on.
 *
 * Once a minute {@see check} looks at every server that has it on. The players are counted by asking the server itself, the way
 * the server list of the game does, so nothing has to be installed on it.
 */
class AutoSleepService
{
    /** What {@see check} did, for the command to report and for the tests. */
    public const DISABLED = 'disabled';

    public const SKIPPED = 'skipped';

    public const UNKNOWN = 'unknown';

    public const BUSY = 'busy';

    public const IDLE = 'idle';

    public const SLEPT = 'slept';

    /** What {@see wake} did. */
    public const WOKEN = 'woken';

    public const NOT_SLEEPING = 'not-sleeping';

    public const AWAKE = 'awake';

    public const COOLDOWN = 'cooldown';

    public const BLOCKED = 'blocked';

    /** How long a server may take to stop before it counts as having been started again. */
    private const STOP_GRACE_MINUTES = 3;

    /** A server is started once in this many seconds however many players try to join, they are told it is starting. */
    private const WAKE_COOLDOWN = 30;

    public function __construct(
        private DaemonServerRepository $serverRepository,
        private DaemonPowerRepository $powerRepository,
        private MinecraftPing $ping,
    ) {
    }

    /** The settings of a server, the defaults (which are off) when it never had any. */
    public function settings(Server $server): ServerAutoSleep
    {
        return ServerAutoSleep::query()->firstOrNew(['server_id' => $server->id]);
    }

    /**
     * Saves what the owner chose. Turning it off forgets whether the server was asleep, so a server that is stopped for any
     * reason is not started by somebody trying to join.
     */
    public function update(Server $server, bool $enabled, int $idleMinutes, bool $wakeOnJoin): ServerAutoSleep
    {
        $settings = $this->settings($server);
        $changed = !$settings->exists || $settings->enabled !== $enabled;

        $settings->fill([
            'enabled' => $enabled,
            'idle_minutes' => $idleMinutes,
            'wake_on_join' => $wakeOnJoin,
        ]);
        if (!$enabled) {
            $settings->idle_since = null;
            $settings->slept_at = null;
        }
        $settings->save();

        if ($changed) {
            Activity::event('server:settings.auto-sleep')->subject($server)->property(['enabled' => $enabled])->log();
        }

        return $settings;
    }

    /** Whether the server is asleep: stopped by auto sleep and not started since. */
    public function isSleeping(Server $server): bool
    {
        $settings = ServerAutoSleep::query()->where('server_id', $server->id)->first();

        return !is_null($settings) && $settings->enabled && !is_null($settings->slept_at);
    }

    /** Whether the server has a domain on the router, which is what lets a player start it by trying to join. */
    public function hasDomain(Server $server): bool
    {
        return ServerDomain::query()->where('server_id', $server->id)->exists();
    }

    /**
     * Looks at one server and puts it to sleep when nobody has been on for as long as its owner chose.
     *
     * Nothing is done when it cannot be seen what is going on (the daemon or the server does not answer), a server is never
     * stopped because of a guess.
     */
    public function check(Server $server, ?CarbonImmutable $now = null): string
    {
        $now ??= CarbonImmutable::now();
        $settings = ServerAutoSleep::query()->where('server_id', $server->id)->first();
        if (is_null($settings) || !$settings->enabled) {
            return self::DISABLED;
        }

        if ($server->isSuspended() || !is_null($server->status) || !is_null($server->transfer)) {
            $settings->update(['idle_since' => null]);

            return self::SKIPPED;
        }

        try {
            $state = $this->serverRepository->setServer($server)->getDetails()['state'] ?? null;
        } catch (\Throwable) {
            return self::UNKNOWN;
        }

        if ($state !== 'running') {
            // Started by somebody else while it slept: it is not asleep any more. Stopping and offline are what sleeping looks
            // like, and a server that was stopped by hand has no sleep to forget.
            $awake = in_array($state, ['starting', 'running'], true);
            $settings->update([
                'idle_since' => null,
                'slept_at' => $awake ? null : $settings->slept_at,
            ]);

            return self::SKIPPED;
        }

        // A server that is still stopping (saving a big world takes a while) is running for a little longer after it was told to
        // stop, that is not somebody having started it.
        if (!is_null($settings->slept_at) && $settings->slept_at->greaterThan($now->subMinutes(self::STOP_GRACE_MINUTES))) {
            return self::SKIPPED;
        }

        $players = $this->ping->players($this->host($server), (int) $server->allocation?->port);
        if (is_null($players)) {
            // Starting up, or a server that cannot be asked. Not knowing is not the same as nobody being there.
            $settings->update(['idle_since' => null, 'slept_at' => null]);

            return self::UNKNOWN;
        }

        if ($players > 0) {
            $settings->update(['idle_since' => null, 'slept_at' => null]);

            return self::BUSY;
        }

        if (is_null($settings->idle_since)) {
            $settings->update(['idle_since' => $now, 'slept_at' => null]);

            return self::IDLE;
        }

        if ($settings->idle_since->addMinutes($settings->idle_minutes)->greaterThan($now)) {
            return self::IDLE;
        }

        $this->powerRepository->setServer($server)->send('stop');
        $settings->update(['idle_since' => null, 'slept_at' => $now]);
        Activity::event('server:power.sleep')->subject($server)->property(['idle_minutes' => $settings->idle_minutes])->log();
        Log::info('Auto sleep: stopped server ' . $server->uuid . ' after ' . $settings->idle_minutes . ' minutes without players.');

        return self::SLEPT;
    }

    /**
     * Starts a server that was put to sleep because a player tried to join it. Anything else is left as it is: a server that
     * its owner stopped, one that is suspended or being installed, one that is awake already.
     */
    public function wake(Server $server): string
    {
        $settings = ServerAutoSleep::query()->where('server_id', $server->id)->first();
        if (is_null($settings) || !$settings->enabled || !$settings->wake_on_join || is_null($settings->slept_at)) {
            return self::NOT_SLEEPING;
        }

        if ($server->isSuspended() || !is_null($server->status) || !is_null($server->transfer)) {
            return self::BLOCKED;
        }

        // Every player that tries asks, the first one starts it.
        if (!Cache::add("autosleep:wake:{$server->id}", 1, self::WAKE_COOLDOWN)) {
            return self::COOLDOWN;
        }

        try {
            $state = $this->serverRepository->setServer($server)->getDetails()['state'] ?? null;
            if ($state !== 'offline') {
                $settings->update(['slept_at' => null]);

                return self::AWAKE;
            }

            $this->powerRepository->setServer($server)->send('start');
        } catch (\Throwable $exception) {
            // Let the next player try straight away.
            Cache::forget("autosleep:wake:{$server->id}");
            Log::warning('Auto sleep: could not wake server ' . $server->uuid . ': ' . $exception->getMessage());

            return self::BLOCKED;
        }

        $settings->update(['slept_at' => null, 'idle_since' => null]);
        Activity::event('server:power.wake')->subject($server)->log();
        Log::info('Auto sleep: woke server ' . $server->uuid . ' because a player tried to join.');

        return self::WOKEN;
    }

    /** The address to ask the server on: its allocation, or the node when the allocation listens on every address. */
    private function host(Server $server): string
    {
        $ip = (string) $server->allocation?->ip;

        return $ip === '' || $ip === '0.0.0.0' ? (string) $server->node->fqdn : $ip;
    }
}

<?php

namespace Pterodactyl\Services\Minecraft;

use Pterodactyl\Models\User;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Models\MinecraftLinkCode;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

/**
 * Linking a Minecraft account to a panel account. A player who joins the Minecraft router with an address that leads nowhere is checked
 * with Mojang by the router (so it is a real, paid account and the person is who they say), and the router asks for a code here. The
 * code is shown on the disconnect screen, and typing it into the account page links the two. A linked account gives the panel account its
 * skin head as the avatar, and lets other people invite it as a subuser by Minecraft name.
 */
class MinecraftLinkService
{
    private const ENABLED = 'settings::minecraft_link:enabled';
    private const ADDRESS = 'settings::minecraft_link:address';

    /** How long a code can be used. */
    public const MINUTES = 15;

    public function __construct(private SettingsRepositoryInterface $settings)
    {
    }

    public function enabled(): bool
    {
        return $this->settings->get(self::ENABLED, 'false') === 'true';
    }

    public function setEnabled(bool $enabled): void
    {
        $this->settings->set(self::ENABLED, $enabled ? 'true' : 'false');
    }

    /** The address players join in Minecraft to get a code: any address that leads to the router, but to no server. Empty when not set. */
    public function address(): string
    {
        return (string) $this->settings->get(self::ADDRESS, '');
    }

    public function setAddress(string $address): void
    {
        $this->settings->set(self::ADDRESS, strtolower(trim($address)));
    }

    /** How many panel accounts have a Minecraft account linked. */
    public function linkedCount(): int
    {
        return User::query()->whereNotNull('minecraft_uuid')->count();
    }

    /** The head of a Minecraft account, for the avatar. Set `minecraft.avatar_url` (with {uuid}) to use another service. */
    public static function avatar(?string $uuid): ?string
    {
        if ($uuid === null || $uuid === '') {
            return null;
        }

        return str_replace('{uuid}', $uuid, (string) config('minecraft.avatar_url', 'https://mc-heads.net/avatar/{uuid}/128'));
    }

    /**
     * What the router shows a player (who it checked with Mojang): their code, or the news that the account is linked already. A player
     * who asks again before the code ran out gets the same code.
     *
     * @return array<string, mixed>
     */
    public function request(string $uuid, string $username): array
    {
        if (!$this->enabled()) {
            return ['status' => 'disabled'];
        }

        $linked = User::query()->where('minecraft_uuid', $uuid)->first();
        if ($linked !== null) {
            // A renamed Minecraft account is noticed the next time it is seen.
            if ($linked->minecraft_username !== $username) {
                $linked->forceFill(['minecraft_username' => $username])->save();
            }

            return ['status' => 'linked', 'account' => $linked->username];
        }

        $this->purge();
        $existing = MinecraftLinkCode::query()->where('minecraft_uuid', $uuid)->first();
        if ($existing === null) {
            $existing = MinecraftLinkCode::query()->create([
                'code' => $this->newCode(),
                'minecraft_uuid' => $uuid,
                'minecraft_username' => $username,
                'expires_at' => now()->addMinutes(self::MINUTES),
            ]);
        } elseif ($existing->minecraft_username !== $username) {
            $existing->forceFill(['minecraft_username' => $username])->save();
        }

        return [
            'status' => 'code',
            'code' => $existing->code,
            'minutes' => max(1, (int) ceil(now()->diffInSeconds($existing->expires_at, false) / 60)),
            'panel' => (string) parse_url((string) config('app.url'), PHP_URL_HOST),
            'where' => 'Account → Minecraft account',
        ];
    }

    /**
     * Links the Minecraft account behind a code to a panel account.
     *
     * @throws DisplayException
     */
    public function link(User $user, string $code): User
    {
        $this->purge();
        $entry = MinecraftLinkCode::query()->where('code', preg_replace('/\D+/', '', $code))->first();
        if ($entry === null) {
            throw new DisplayException('That code is not right, or it has expired. Join the Minecraft server again to get a new one.');
        }

        return DB::transaction(function () use ($user, $entry) {
            $taken = User::query()->where('minecraft_uuid', $entry->minecraft_uuid)->where('id', '!=', $user->id)->exists();
            if ($taken) {
                $entry->delete();

                throw new DisplayException('That Minecraft account is linked to another account of this panel already.');
            }

            $user->forceFill(['minecraft_uuid' => $entry->minecraft_uuid, 'minecraft_username' => $entry->minecraft_username])->save();
            $entry->delete();

            return $user;
        });
    }

    public function unlink(User $user): void
    {
        $user->forceFill(['minecraft_uuid' => null, 'minecraft_username' => null])->save();
    }

    /** The panel account that linked a Minecraft name (how a subuser is invited by it). */
    public function findByName(string $username): ?User
    {
        return User::query()->whereNotNull('minecraft_uuid')->where('minecraft_username', $username)->first();
    }

    /** Throws away the codes that ran out. */
    public function purge(): void
    {
        MinecraftLinkCode::query()->where('expires_at', '<', now())->delete();
    }

    private function newCode(): string
    {
        do {
            $code = (string) random_int(100000, 999999);
        } while (MinecraftLinkCode::query()->where('code', $code)->exists());

        return $code;
    }
}

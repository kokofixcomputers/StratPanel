<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * An answer to a challenge of Let's Encrypt: it fetches /.well-known/acme-challenge/<token> over http from the domain and wants the
 * content back. In the database and not in the cache, the web server that answers and the queue worker that asks do not share memory.
 *
 * @property string $token
 * @property string $content
 * @property \Carbon\CarbonImmutable $expires_at
 */
class AcmeChallenge extends Model
{
    protected $table = 'acme_challenges';

    protected $primaryKey = 'token';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime'];
    }

    public static function publish(string $token, string $content): void
    {
        // What nobody will ask for any more is cleaned up while we are here.
        static::query()->where('expires_at', '<', now())->delete();
        static::query()->updateOrCreate(['token' => $token], ['content' => $content, 'expires_at' => now()->addMinutes(15)]);
    }

    public static function answer(string $token): ?string
    {
        $found = static::query()->where('token', $token)->where('expires_at', '>', now())->first();

        return $found?->content;
    }

    public static function forget(string $token): void
    {
        static::query()->where('token', $token)->delete();
    }
}

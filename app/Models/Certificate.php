<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A certificate (and its private key) for serving the panel over https.
 *
 * @property int $id
 * @property string $name
 * @property list<string> $domains
 * @property string $certificate
 * @property string $private_key
 * @property string|null $issuer
 * @property \Carbon\CarbonImmutable|null $not_before
 * @property \Carbon\CarbonImmutable|null $not_after
 * @property string $fingerprint
 * @property bool $enabled
 * @property bool $is_default
 */
class Certificate extends Model
{
    /** Warned about from this many days before the end. */
    public const EXPIRING_DAYS = 14;

    protected $table = 'certificates';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    /** The key never leaves the server, not even in an array or JSON by accident. */
    protected $hidden = ['private_key'];

    protected function casts(): array
    {
        return [
            'renewed_at' => 'datetime',
            'domains' => 'array',
            'private_key' => 'encrypted',
            'not_before' => 'datetime',
            'not_after' => 'datetime',
            'enabled' => 'boolean',
            'is_default' => 'boolean',
        ];
    }

    public function isExpired(): bool
    {
        return $this->not_after !== null && $this->not_after->isPast();
    }

    public function isExpiring(): bool
    {
        return !$this->isExpired() && $this->not_after !== null && $this->not_after->lt(now()->addDays(self::EXPIRING_DAYS));
    }

    /** Whole days left, negative once it ended. */
    public function daysLeft(): ?int
    {
        return $this->not_after === null ? null : (int) floor(now()->diffInDays($this->not_after, false));
    }
}

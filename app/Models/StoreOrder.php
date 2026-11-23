<?php

namespace Pterodactyl\Models;

use Illuminate\Support\Str;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One payment in the store. What was bought is kept on the order as it was, the package can change later.
 *
 * @property int $id
 * @property string $uuid
 * @property int $user_id
 * @property int|null $package_id
 * @property string $package_name
 * @property string $kind
 * @property array<string, int> $specs
 * @property int $amount
 * @property string $currency
 * @property int|null $period_days
 * @property string $provider
 * @property string|null $provider_reference
 * @property string|null $provider_payment
 * @property string $status
 * @property int|null $box_id
 * @property int|null $server_id
 * @property bool $renewal
 * @property \Illuminate\Support\Carbon|null $paid_at
 * @property \Illuminate\Support\Carbon|null $fulfilled_at
 * @property string|null $error
 * @property User $user
 */
class StoreOrder extends Model
{
    public const PENDING = 'pending';
    public const PAID = 'paid';
    public const CANCELED = 'canceled';
    public const FAILED = 'failed';
    public const REFUNDED = 'refunded';

    protected $table = 'store_orders';

    protected $guarded = ['id', 'uuid'];

    protected $casts = [
        'specs' => 'array',
        'amount' => 'integer',
        'period_days' => 'integer',
        'renewal' => 'boolean',
        'paid_at' => 'datetime',
        'fulfilled_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (StoreOrder $order) {
            $order->uuid ??= (string) Str::uuid();
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** What the payment is for: one line for every box or server. */
    public function items(): HasMany
    {
        return $this->hasMany(StoreOrderItem::class, 'order_id')->orderBy('id');
    }

    /** Whether something on the order still has to be made (it was paid, and a line is not done). */
    public function isSettingUp(): bool
    {
        return $this->status === self::PAID && $this->items->contains(fn (StoreOrderItem $i) => $i->fulfilled_at === null);
    }

    public function package(): BelongsTo
    {
        return $this->belongsTo(StorePackage::class, 'package_id');
    }
}

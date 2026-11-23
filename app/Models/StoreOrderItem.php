<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One box or server on an order: bought as it was when it was bought, with what was made of it.
 *
 * @property int $id
 * @property int $order_id
 * @property int|null $package_id
 * @property string $package_name
 * @property string $kind
 * @property array<string, mixed> $specs
 * @property int $amount
 * @property int|null $period_days
 * @property bool $renewal
 * @property int|null $box_id
 * @property int|null $server_id
 * @property \Illuminate\Support\Carbon|null $fulfilled_at
 * @property string|null $error
 */
class StoreOrderItem extends Model
{
    protected $table = 'store_order_items';

    protected $guarded = ['id'];

    protected $casts = [
        'specs' => 'array',
        'amount' => 'integer',
        'period_days' => 'integer',
        'renewal' => 'boolean',
        'fulfilled_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(StoreOrder::class, 'order_id');
    }
}

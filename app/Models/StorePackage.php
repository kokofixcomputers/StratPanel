<?php

namespace Pterodactyl\Models;

use Illuminate\Support\Str;
use Illuminate\Database\Eloquent\Model;

/**
 * Something the store sells: a server of a certain size, or a box.
 *
 * @property int $id
 * @property string $uuid
 * @property string $name
 * @property string|null $description
 * @property string $kind
 * @property bool $active
 * @property int $sort
 * @property int $price
 * @property int|null $period_days
 * @property int $memory
 * @property int $disk
 * @property int $cpu
 * @property int $allocations
 * @property int $backups
 * @property int $databases
 * @property int|null $node_id
 * @property int|null $egg_id
 */
class StorePackage extends Model
{
    public const SERVER = 'server';
    public const BOX = 'box';

    protected $table = 'store_packages';

    protected $guarded = ['id', 'uuid'];

    protected $casts = [
        'active' => 'boolean',
        'sort' => 'integer',
        'price' => 'integer',
        'period_days' => 'integer',
        'memory' => 'integer',
        'disk' => 'integer',
        'cpu' => 'integer',
        'allocations' => 'integer',
        'backups' => 'integer',
        'databases' => 'integer',
        'node_id' => 'integer',
        'egg_id' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (StorePackage $package) {
            $package->uuid ??= (string) Str::uuid();
        });
    }

    /** @return array{memory: int, disk: int, cpu: int, allocations: int, backups: int, databases: int} */
    public function specs(): array
    {
        return [
            'memory' => $this->memory,
            'disk' => $this->disk,
            'cpu' => $this->cpu,
            'allocations' => $this->allocations,
            'backups' => $this->backups,
            'databases' => $this->databases,
        ];
    }
}

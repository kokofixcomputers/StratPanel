<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * An extension that is installed on the panel, and whether it is on.
 *
 * @property int $id
 * @property string $ext_id
 * @property string $name
 * @property string $version
 * @property bool $enabled
 * @property array<string, mixed>|null $settings
 * @property string|null $last_error
 * @property \Carbon\CarbonImmutable|null $last_error_at
 */
class InstalledExtension extends Model
{
    protected $table = 'extensions';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'settings' => 'array',
            'last_error_at' => 'datetime',
        ];
    }
}

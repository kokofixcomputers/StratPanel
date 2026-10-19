<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A folder of the dashboard, belonging to one user.
 *
 * @property int $id
 * @property int $user_id
 * @property string $name
 * @property int $position
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property User $user
 */
class DashboardFolder extends Model
{
    public const RESOURCE_NAME = 'dashboard_folder';
    public const MAX_PER_USER = 50;

    protected $table = 'dashboard_folders';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    public static array $validationRules = [
        'name' => ['required', 'string', 'min:1', 'max:40'],
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function prefs(): HasMany
    {
        return $this->hasMany(DashboardServerPref::class, 'folder_id');
    }
}

<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * What one user did with one server on the dashboard: the folder it is in and whether it is starred.
 *
 * @property int $id
 * @property int $user_id
 * @property int $server_id
 * @property int|null $folder_id
 * @property bool $starred
 */
class DashboardServerPref extends Model
{
    public const RESOURCE_NAME = 'dashboard_server_pref';

    protected $table = 'dashboard_server_prefs';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = ['starred' => 'boolean'];

    public static array $validationRules = [];

    public function folder(): BelongsTo
    {
        return $this->belongsTo(DashboardFolder::class, 'folder_id');
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}

<?php

namespace Pterodactyl\Models;

use Pterodactyl\Rules\Username;
use Pterodactyl\Facades\Activity;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rules\In;
use Illuminate\Auth\Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\Builder;
use Pterodactyl\Contracts\Models\Identifiable;
use Pterodactyl\Models\Traits\HasAccessTokens;
use Illuminate\Auth\Passwords\CanResetPassword;
use Pterodactyl\Traits\Helpers\AvailableLanguages;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Pterodactyl\Services\Roles\PermissionRegistry;
use Illuminate\Foundation\Auth\Access\Authorizable;
use Pterodactyl\Models\Traits\HasRealtimeIdentifier;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Contracts\Auth\Access\Authorizable as AuthorizableContract;
use Illuminate\Contracts\Auth\CanResetPassword as CanResetPasswordContract;
use Pterodactyl\Notifications\SendPasswordReset as ResetPasswordNotification;

/**
 * Pterodactyl\Models\User.
 *
 * @property int $id
 * @property string|null $external_id
 * @property string $uuid
 * @property string $username
 * @property string $email
 * @property string|null $name_first
 * @property string|null $name_last
 * @property string $password
 * @property string|null $remember_token
 * @property string $language
 * @property bool $root_admin
 * @property bool $use_totp
 * @property string|null $totp_secret
 * @property \Illuminate\Support\Carbon|null $totp_authenticated_at
 * @property bool $gravatar
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property \Illuminate\Database\Eloquent\Collection|\Pterodactyl\Models\ApiKey[] $apiKeys
 * @property int|null $api_keys_count
 * @property string $name
 * @property \Illuminate\Notifications\DatabaseNotificationCollection|\Illuminate\Notifications\DatabaseNotification[] $notifications
 * @property int|null $notifications_count
 * @property \Illuminate\Database\Eloquent\Collection|\Pterodactyl\Models\RecoveryToken[] $recoveryTokens
 * @property int|null $recovery_tokens_count
 * @property \Illuminate\Database\Eloquent\Collection|\Pterodactyl\Models\Server[] $servers
 * @property int|null $servers_count
 * @property \Illuminate\Database\Eloquent\Collection|\Pterodactyl\Models\UserSSHKey[] $sshKeys
 * @property int|null $ssh_keys_count
 * @property \Illuminate\Database\Eloquent\Collection|\Pterodactyl\Models\ApiKey[] $tokens
 * @property int|null $tokens_count
 *
 * @method static \Database\Factories\UserFactory factory(...$parameters)
 * @method static Builder|User newModelQuery()
 * @method static Builder|User newQuery()
 * @method static Builder|User query()
 * @method static Builder|User whereCreatedAt($value)
 * @method static Builder|User whereEmail($value)
 * @method static Builder|User whereExternalId($value)
 * @method static Builder|User whereGravatar($value)
 * @method static Builder|User whereId($value)
 * @method static Builder|User whereLanguage($value)
 * @method static Builder|User whereNameFirst($value)
 * @method static Builder|User whereNameLast($value)
 * @method static Builder|User wherePassword($value)
 * @method static Builder|User whereRememberToken($value)
 * @method static Builder|User whereRootAdmin($value)
 * @method static Builder|User whereTotpAuthenticatedAt($value)
 * @method static Builder|User whereTotpSecret($value)
 * @method static Builder|User whereUpdatedAt($value)
 * @method static Builder|User whereUseTotp($value)
 * @method static Builder|User whereUsername($value)
 * @method static Builder|User whereUuid($value)
 *
 * @mixin \Eloquent
 */
#[Attributes\Identifiable('user')]
class User extends Model implements
    AuthenticatableContract,
    AuthorizableContract,
    CanResetPasswordContract,
    Identifiable
{
    use Authenticatable;
    use Authorizable;
    use AvailableLanguages;
    use CanResetPassword;
    /** @use \Pterodactyl\Models\Traits\HasAccessTokens<\Pterodactyl\Models\ApiKey> */
    use HasAccessTokens;
    use Notifiable;
    /** @use \Illuminate\Database\Eloquent\Factories\HasFactory<\Database\Factories\UserFactory> */
    use HasFactory;
    use HasRealtimeIdentifier;

    public const USER_LEVEL_USER = 0;
    public const USER_LEVEL_ADMIN = 1;

    /**
     * The resource name for this model when it is transformed into an
     * API representation using fractal.
     */
    public const RESOURCE_NAME = 'user';

    /**
     * Level of servers to display when using access() on a user.
     */
    protected string $accessLevel = 'all';

    /**
     * The table associated with the model.
     */
    protected $table = 'users';

    /**
     * A list of mass-assignable variables.
     */
    protected $fillable = [
        'external_id',
        'username',
        'email',
        'name_first',
        'name_last',
        'password',
        'language',
        'use_totp',
        'totp_secret',
        'totp_authenticated_at',
        'gravatar',
        'root_admin',
    ];

    /**
     * Cast values to correct type.
     */
    protected $casts = [
        'root_admin' => 'boolean',
        'use_totp' => 'boolean',
        'password_set' => 'boolean',
        'gravatar' => 'boolean',
        'totp_authenticated_at' => 'datetime',
    ];

    /**
     * The attributes excluded from the model's JSON form.
     */
    protected $hidden = ['password', 'remember_token', 'totp_secret', 'totp_authenticated_at'];

    /**
     * Default values for specific fields in the database.
     */
    protected $attributes = [
        'external_id' => null,
        'root_admin' => false,
        'language' => 'en',
        'password_set' => true,
        'use_totp' => false,
        'totp_secret' => null,
    ];

    /**
     * Rules verifying that the data being stored matches the expectations of the database.
     */
    public static array $validationRules = [
        'uuid' => 'required|string|size:36|unique:users,uuid',
        'email' => 'required|email:strict|between:1,191|unique:users,email',
        'external_id' => 'sometimes|nullable|string|max:191|unique:users,external_id',
        'username' => 'required|between:1,191|unique:users,username',
        'name_first' => 'required|string|between:1,191',
        'name_last' => 'required|string|between:1,191',
        'password' => 'sometimes|nullable|string',
        'root_admin' => 'boolean',
        'language' => 'string',
        'use_totp' => 'boolean',
        'totp_secret' => 'nullable|string',
    ];

    /**
     * Implement language verification by overriding Eloquence's gather
     * rules function.
     */
    public static function getRules(): array
    {
        $rules = parent::getRules();

        $rules['language'][] = new In(array_keys((new self())->getAvailableLanguages()));
        $rules['username'][] = new Username();

        return $rules;
    }

    /**
     * Return the user model in a format that can be passed over to Vue templates.
     */
    public function toVueObject(): array
    {
        return Collection::make($this->toArray())->except(['id', 'external_id'])
            ->merge([
                'identifier' => $this->identifier,
                'can_access_admin' => $this->canAccessAdmin(),
                'can_access_all_servers' => $this->canAccessAllServers(),
                // What the admin area shows this person: every permission for root admins, the ones of their roles for the rest.
                'admin_permissions' => $this->root_admin ? PermissionRegistry::all() : $this->rolePermissions(),
            ])
            ->toArray();
    }

    /**
     * Send the password reset notification.
     *
     * @param string $token
     */
    public function sendPasswordResetNotification($token)
    {
        Activity::event('auth:reset-password')
            ->withRequestMetadata()
            ->subject($this)
            ->log('sending password reset email');

        $this->notify(new ResetPasswordNotification($token));
    }

    /**
     * Store the username as a lowercase string.
     */
    public function setUsernameAttribute(string $value)
    {
        $this->attributes['username'] = mb_strtolower($value);
    }

    /**
     * Return a concatenated result for the accounts full name.
     */
    public function getNameAttribute(): string
    {
        return trim($this->name_first . ' ' . $this->name_last);
    }

    /**
     * Returns all servers that a user owns.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<\Pterodactyl\Models\Server, $this>
     */
    public function servers(): HasMany
    {
        return $this->hasMany(Server::class, 'owner_id');
    }

    /**
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<\Pterodactyl\Models\ApiKey, $this>
     */
    public function apiKeys(): HasMany
    {
        return $this->hasMany(ApiKey::class)
            ->where('key_type', ApiKey::TYPE_ACCOUNT);
    }

    /**
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<\Pterodactyl\Models\RecoveryToken, $this>
     */
    public function recoveryTokens(): HasMany
    {
        return $this->hasMany(RecoveryToken::class);
    }

    /**
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<\Pterodactyl\Models\UserSSHKey, $this>
     */
    /** The roles of this user, see Role. */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user')->withPivot('created_at')->orderBy('roles.name');
    }

    /** @var array{grants: list<string>, denied: list<string>}|null what the roles say, kept for the length of the request */
    private ?array $permissionCache = null;

    /** @return array{grants: list<string>, denied: list<string>} everything the roles of this user grant and deny */
    private function roleDecisions(): array
    {
        if ($this->permissionCache === null) {
            $roles = $this->roles()->get();
            $this->permissionCache = [
                'grants' => PermissionRegistry::normalize($roles->flatMap(fn (Role $role) => (array) $role->permissions)->all()),
                'denied' => PermissionRegistry::normalizeDenied($roles->flatMap(fn (Role $role) => (array) $role->denied)->all()),
            ];
        }

        return $this->permissionCache;
    }

    /** Whether a role takes this away: the permission itself, or the "view" of its group that it needs. */
    private function isDeniedByRole(string $permission): bool
    {
        $denied = $this->roleDecisions()['denied'];
        $view = PermissionRegistry::viewOf($permission);

        return in_array($permission, $denied, true) || ($view !== null && in_array($view, $denied, true));
    }

    /**
     * What this user may do in the admin area, from the roles they have: what the roles grant, less what any of them denies. Root admins
     * hold everything, they are not listed here.
     *
     * @return list<string>
     */
    public function rolePermissions(): array
    {
        return array_values(array_filter(
            $this->roleDecisions()['grants'],
            fn (string $key) => !PermissionRegistry::isUser($key) && !$this->isDeniedByRole($key)
        ));
    }

    /**
     * What the roles of this user say about a permission: "deny" (any role denies it), "grant" or null (nothing, the default).
     * Root admins are not limited by roles.
     */
    public function permissionState(string $permission): ?string
    {
        if ($this->root_admin) {
            return 'grant';
        }
        if ($this->isDeniedByRole($permission)) {
            return 'deny';
        }

        return in_array($permission, $this->roleDecisions()['grants'], true) ? 'grant' : null;
    }

    /**
     * Whether this user may do something that everybody may do by default (see PermissionRegistry::user()): a role that denies it takes it
     * away, one that grants it gives it even where the default is no. `$default` is what the panel says without any role.
     */
    public function allowedTo(string $permission, bool $default = true): bool
    {
        return match ($this->permissionState($permission)) {
            'deny' => false,
            'grant' => true,
            default => $default,
        };
    }

    /** Forgets the permissions that were looked up, for after the roles of the user changed. */
    public function forgetPermissions(): void
    {
        $this->permissionCache = null;
        $this->unsetRelation('roles');
    }

    /** Whether this user holds an admin permission. Root admins hold every permission. */
    public function hasPermission(string $permission): bool
    {
        return (bool) $this->root_admin || in_array($permission, $this->rolePermissions(), true);
    }

    /** Whether this user holds at least one of these permissions. */
    public function hasAnyPermission(string ...$permissions): bool
    {
        foreach ($permissions as $permission) {
            if ($this->hasPermission($permission)) {
                return true;
            }
        }

        return false;
    }

    /** Whether the admin area is open to this user at all: root admins, and anybody whose roles give them a permission. */
    public function canAccessAdmin(): bool
    {
        return (bool) $this->root_admin || count($this->rolePermissions()) > 0;
    }

    /** Whether this user may open every server in the panel like its owner (root admins, and roles with "servers.access"). */
    public function canAccessAllServers(): bool
    {
        return $this->hasPermission('servers.access');
    }

    /**
     * Whether this user may change the account of another: root admins may change anybody, everybody else may change accounts that
     * are not root admins and hold nothing they do not hold themselves (or an account could be used to get more than the roles give).
     */
    public function outranks(User $other): bool
    {
        if ($this->root_admin) {
            return true;
        }
        if ($other->root_admin) {
            return false;
        }

        return count(array_diff($other->rolePermissions(), $this->rolePermissions())) === 0;
    }

    /** The accounts at other services this user can sign in with. */
    public function identities(): HasMany
    {
        return $this->hasMany(UserIdentity::class);
    }

    /** The passkeys this user can sign in with. */
    public function passkeys(): HasMany
    {
        return $this->hasMany(UserPasskey::class);
    }

    public function sshKeys(): HasMany
    {
        return $this->hasMany(UserSSHKey::class);
    }

    /**
     * Returns all the activity logs where this user is the subject — not to
     * be confused by activity logs where this user is the _actor_.
     *
     * @return \Illuminate\Database\Eloquent\Relations\MorphToMany<\Pterodactyl\Models\ActivityLog, $this>
     */
    public function activity(): MorphToMany
    {
        return $this->morphToMany(ActivityLog::class, 'subject', 'activity_log_subjects');
    }

    /**
     * Returns all the servers that a user can access by way of being the owner of the
     * server, or because they are assigned as a subuser for that server.
     *
     * @return \Illuminate\Database\Eloquent\Builder<\Pterodactyl\Models\Server>
     */
    public function accessibleServers(): Builder
    {
        return Server::query()
            ->select('servers.*')
            ->leftJoin('subusers', 'subusers.server_id', '=', 'servers.id')
            ->where(function (Builder $builder) {
                $builder->where('servers.owner_id', $this->id)->orWhere('subusers.user_id', $this->id);
            })
            ->groupBy('servers.id');
    }
}

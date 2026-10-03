<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Restricted Environment
    |--------------------------------------------------------------------------
    |
    | Set this environment variable to true to enable a restricted configuration
    | setup on the panel. When set to true, configurations stored in the
    | database will not be applied.
    */

    'load_environment_only' => (bool) env('APP_ENVIRONMENT_ONLY', false),

    /*
    |--------------------------------------------------------------------------
    | Service Author
    |--------------------------------------------------------------------------
    |
    | Each panel installation is assigned a unique UUID to identify the
    | author of custom services, and make upgrades easier by identifying
    | standard Pterodactyl shipped services.
    */

    'service' => [
        'author' => env('APP_SERVICE_AUTHOR', 'unknown@unknown.com'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication
    |--------------------------------------------------------------------------
    |
    | Should login success and failure events trigger an email to the user?
    */

    'auth' => [
        '2fa_required' => env('APP_2FA_REQUIRED', 0),
        '2fa' => [
            'bytes' => 32,
            'window' => env('APP_2FA_WINDOW', 4),
            'verify_newer' => true,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Pagination
    |--------------------------------------------------------------------------
    |
    | Certain pagination result counts can be configured here and will take
    | effect globally.
    */

    'paginate' => [
        'frontend' => [
            'servers' => env('APP_PAGINATE_FRONT_SERVERS', 15),
        ],
        'admin' => [
            'servers' => env('APP_PAGINATE_ADMIN_SERVERS', 25),
            'users' => env('APP_PAGINATE_ADMIN_USERS', 25),
        ],
        'api' => [
            'nodes' => env('APP_PAGINATE_API_NODES', 25),
            'servers' => env('APP_PAGINATE_API_SERVERS', 25),
            'users' => env('APP_PAGINATE_API_USERS', 25),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Guzzle Connections
    |--------------------------------------------------------------------------
    |
    | Configure the timeout to be used for Guzzle connections here.
    */

    'guzzle' => [
        'timeout' => env('GUZZLE_TIMEOUT', 15),
        'connect_timeout' => env('GUZZLE_CONNECT_TIMEOUT', 5),
    ],

    /*
    |--------------------------------------------------------------------------
    | CDN
    |--------------------------------------------------------------------------
    |
    | Information for the panel to use when contacting the CDN to confirm
    | if panel is up to date.
    */

    'cdn' => [
        'cache_time' => 60,
        'url' => 'https://cdn.pterodactyl.io/releases/latest.json',
    ],

    /*
    |--------------------------------------------------------------------------
    | Client Features
    |--------------------------------------------------------------------------
    |
    | Allow clients to create their own databases.
    */

    'client_features' => [
        'databases' => [
            'enabled' => env('PTERODACTYL_CLIENT_DATABASES_ENABLED', true),
            'allow_random' => env('PTERODACTYL_CLIENT_DATABASES_ALLOW_RANDOM', true),
        ],

        'schedules' => [
            // The total number of tasks that can exist for any given schedule at once.
            'per_schedule_task_limit' => env('PTERODACTYL_PER_SCHEDULE_TASK_LIMIT', 10),
        ],

        'allocations' => [
            'enabled' => env('PTERODACTYL_CLIENT_ALLOCATIONS_ENABLED', false),
            'range_start' => env('PTERODACTYL_CLIENT_ALLOCATIONS_RANGE_START'),
            'range_end' => env('PTERODACTYL_CLIENT_ALLOCATIONS_RANGE_END'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | File Editor
    |--------------------------------------------------------------------------
    |
    | This array includes the MIME filetypes that can be edited via the web.
    */

    'files' => [
        'max_edit_size' => env('PTERODACTYL_FILES_MAX_EDIT_SIZE', 1024 * 1024 * 4),
    ],

    /*
    |--------------------------------------------------------------------------
    | Dynamic Environment Variables
    |--------------------------------------------------------------------------
    |
    | Place dynamic environment variables here that should be auto-appended
    | to server environment fields when the server is created or updated.
    |
    | Items should be in 'key' => 'value' format, where key is the environment
    | variable name, and value is the server-object key. For example:
    |
    | 'P_SERVER_CREATED_AT' => 'created_at'
    */

    'environment_variables' => [
        'P_SERVER_ALLOCATION_LIMIT' => 'allocation_limit',
    ],

    /*
    |--------------------------------------------------------------------------
    | Asset Verification
    |--------------------------------------------------------------------------
    |
    | This section controls the output format for JS & CSS assets.
    */

    'assets' => [
        'use_hash' => env('PTERODACTYL_USE_ASSET_HASH', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Email Notification Settings
    |--------------------------------------------------------------------------
    |
    | This section controls what notifications are sent to users.
    */

    'email' => [
        // Should an email be sent to a server owner once their server has completed it's first install process?
        'send_install_notification' => env('PTERODACTYL_SEND_INSTALL_NOTIFICATION', true),
        // Should an email be sent to a server owner whenever their server is reinstalled?
        'send_reinstall_notification' => env('PTERODACTYL_SEND_REINSTALL_NOTIFICATION', true),
    ],

    /*
    |--------------------------------------------------------------------------
    | Telemetry Settings
    |--------------------------------------------------------------------------
    |
    | This section controls the telemetry sent by Pterodactyl.
    */

    'telemetry' => [
        'enabled' => env('PTERODACTYL_TELEMETRY_ENABLED', true),
    ],

    'features' => [
        'new_server_identifiers' => (bool) env('PTERODACTYL_USE_SERVER_IDENTIFIERS', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Self Service Server Creation
    |--------------------------------------------------------------------------
    |
    | Allows users to create a Minecraft server for themselves from the "Create new"
    | page in the dashboard. Servers are placed on any public node that has room and
    | a free allocation, using the Egg below and the resource limits configured here.
    | Root administrators are never limited by "max_servers".
    */

    'self_service' => [
        'enabled' => (bool) env('PTERODACTYL_SELF_SERVICE_ENABLED', true),
        // The egg to create servers with. Leave empty to automatically use an egg named "Java", then Paper, then Vanilla, then any Minecraft egg.
        'egg' => env('PTERODACTYL_SELF_SERVICE_EGG'),
        // Comma separated location ids that servers may be placed in. Leave empty to use any location.
        'locations' => array_values(array_filter(array_map('intval', explode(',', (string) env('PTERODACTYL_SELF_SERVICE_LOCATIONS', ''))))),
        // The maximum number of servers a regular user may own. Set to 0 for no limit.
        'max_servers' => (int) env('PTERODACTYL_SELF_SERVICE_MAX_SERVERS', 3),
        // Skip the egg's install script. Leave empty to skip it automatically for eggs whose name starts with "Java".
        'skip_scripts' => env('PTERODACTYL_SELF_SERVICE_SKIP_SCRIPTS') === null ? null : filter_var(env('PTERODACTYL_SELF_SERVICE_SKIP_SCRIPTS'), FILTER_VALIDATE_BOOLEAN),
        'memory' => (int) env('PTERODACTYL_SELF_SERVICE_MEMORY', 2048),
        'disk' => (int) env('PTERODACTYL_SELF_SERVICE_DISK', 10240),
        'cpu' => (int) env('PTERODACTYL_SELF_SERVICE_CPU', 200),
        // The most a user may pick for themselves in the "Edit specs" step of the create page.
        'max_memory' => (int) env('PTERODACTYL_SELF_SERVICE_MAX_MEMORY', 8192),
        'max_disk' => (int) env('PTERODACTYL_SELF_SERVICE_MAX_DISK', 51200),
        'max_cpu' => (int) env('PTERODACTYL_SELF_SERVICE_MAX_CPU', 400),
        'databases' => (int) env('PTERODACTYL_SELF_SERVICE_DATABASES', 1),
        'allocations' => (int) env('PTERODACTYL_SELF_SERVICE_ALLOCATIONS', 1),
        'backups' => (int) env('PTERODACTYL_SELF_SERVICE_BACKUPS', 2),
    ],

    /*
    |--------------------------------------------------------------------------
    | Custom Domains
    |--------------------------------------------------------------------------
    |
    | Lets users point their own domain at a server. The domain only needs an A record that points at
    | the machine running the Minecraft router (tools/mc-router), which reads the address a player typed
    | and forwards the connection to the matching allocation.
    */

    'domains' => [
        'enabled' => (bool) env('PTERODACTYL_DOMAINS_ENABLED', true),
        // The public IP address users have to point their A record at. Leave empty to resolve the panel's host name.
        'target_ip' => env('PTERODACTYL_DOMAINS_TARGET_IP'),
        // The most domains a single server may have. Set to 0 for no limit.
        'max_per_server' => (int) env('PTERODACTYL_DOMAINS_MAX_PER_SERVER', 5),
        // Shared secret the router uses to read the domain list. Leave empty to disable the router API.
        'router_token' => env('PTERODACTYL_DOMAINS_ROUTER_TOKEN'),
    ],
];

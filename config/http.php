<?php

return [
    /*
    |--------------------------------------------------------------------------
    | API Rate Limits
    |--------------------------------------------------------------------------
    |
    | Defines the rate limit for the number of requests per minute that can be
    | executed against both the client and internal (application) APIs over the
    | defined period (by default, 1 minute).
    |
    */
    'rate_limit' => [
        'client_period' => 1,
        'client' => env('APP_API_CLIENT_RATELIMIT', 256),

        'application_period' => 1,
        'application' => env('APP_API_APPLICATION_RATELIMIT', 256),

        // Downloads a server may start from a link (mods, plugins, worlds, modpacks), counted for each server. Installing one
        // mod with its dependencies is several downloads, installing a modpack is one per file (packs have a few hundred).
        'file_pull_period' => env('APP_FILE_PULL_PERIOD', 1),
        'file_pull' => env('APP_FILE_PULL_RATELIMIT', 300),
    ],

    // The most files one list of downloads (a modpack) may have.
    'pull_batch_max' => env('APP_PULL_BATCH_MAX', 500),
];

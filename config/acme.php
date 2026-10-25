<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Let's Encrypt for the domains of servers
    |--------------------------------------------------------------------------
    |
    | Set under Admin > Settings > Certificates. When on, the Domains tab of a server gets a button that gets a free certificate from
    | Let's Encrypt for the domain, with nothing to set up by hand: the panel answers the challenge, adds the certificate under
    | Certificates and renews it before it ends. It needs the edge listening on port 80 (the challenge is answered over http).
    */
    'enabled' => false,

    // The address Let's Encrypt can reach the admin on (they stopped needing it, it is only used for notices about expiring certificates).
    'email' => '',

    // The staging directory of Let's Encrypt gives certificates nothing trusts but has far higher limits, for trying things out.
    'staging' => false,

    'directory' => env('PTERODACTYL_ACME_DIRECTORY', 'https://acme-v02.api.letsencrypt.org/directory'),
    'staging_directory' => 'https://acme-staging-v02.api.letsencrypt.org/directory',

    // The dns challenge: how long the panel waits for the person to add the TXT record, and how often it looks. The job holds a queue
    // worker meanwhile.
    'dns_wait_seconds' => 900,
    'dns_poll_seconds' => 10,

    // Renew from this many days before the end (Let's Encrypt certificates last 90 days).
    'renew_days' => 30,
];

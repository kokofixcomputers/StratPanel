<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Certificates for serving the panel over https
    |--------------------------------------------------------------------------
    |
    | Certificates are added under Admin > Settings > Certificates. A small program on the machine of the panel (tools/panel-edge)
    | fetches them with this secret and serves the panel over https with them. Leave it empty to turn that off, the certificates are
    | then not given to anybody. tools/panel-edge/install.sh makes one.
    */
    'token' => env('PTERODACTYL_CERTIFICATES_TOKEN'),
];

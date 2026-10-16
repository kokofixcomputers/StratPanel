<?php

return [
    // Where the nodes (and the panel, to show the latest version) find the Wings build of Stratosphere. It has version.txt,
    // checksums.txt and wings_linux_<arch>.
    'wings_url' => env('WINGS_UPDATE_URL', 'https://github.com/kokofixcomputers/stratwings/releases/download/nightly'),

    // Where the updater downloads panel.tar.gz from, for the latest release and for the nightly build. Shown on the Updates page; the
    // updater itself reads them from /etc/stratosphere-updater.env.
    'panel_tar_url' => env('PANEL_TAR_URL', 'https://github.com/kokofixcomputers/StratPanel/releases/latest/download/panel.tar.gz'),
    'panel_tar_nightly_url' => env('PANEL_TAR_NIGHTLY_URL', 'https://github.com/kokofixcomputers/StratPanel/releases/download/nightly/panel.tar.gz'),

    // How the panel asks the updater (a systemd service on the panel machine, see tools/updater) to work: it writes the request
    // here, the updater writes its answer to the status file.
    'request_file' => storage_path('app/updates/request'),
    'status_file' => storage_path('app/updates/status.json'),
];

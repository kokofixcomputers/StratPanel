<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Trash bin
    |--------------------------------------------------------------------------
    |
    | When on, what is deleted from a server (files and folders, schedules) is kept in the trash bin of that server instead of being
    | gone for good, and can be recovered by people who may. Set under Admin > Settings > Trash. Off unless an admin turns it on.
    */
    'enabled' => false,

    // How many days something stays in the trash bin before it is deleted for good.
    'retention_days' => 30,

    // The folder in the root of a server where deleted files are kept until they are recovered or expire.
    'directory' => '.stratosphere-trash',
];

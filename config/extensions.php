<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Extensions
    |--------------------------------------------------------------------------
    |
    | Set STRATOSPHERE_EXTENSIONS=false in the .env to start the panel without any extension (safe mode). That is the way back
    | when an extension broke something that the panel could not carry on without. Nothing is deleted, they come back when it is
    | set to true again.
    */
    'enabled' => env('STRATOSPHERE_EXTENSIONS', true),

    // Where the files of the installed extensions are. It is in storage so an update of the panel leaves them alone.
    'directory' => env('STRATOSPHERE_EXTENSIONS_DIRECTORY', storage_path('extensions')),

    // The most a .stratext may hold, so a package cannot fill the disk when it is unpacked.
    'max_package_bytes' => 50 * 1024 * 1024,
    'max_unpacked_bytes' => 200 * 1024 * 1024,
    'max_files' => 3000,
];

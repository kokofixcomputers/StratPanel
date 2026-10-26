<?php

/**
 * Contains all of the translation strings for different activity log
 * events. These should be keyed by the value in front of the colon (:)
 * in the event name. If there is no colon present, they should live at
 * the top level.
 */
return [
    'auth' => [
        'fail' => 'Failed log in',
        'success' => 'Logged in',
        'password-reset' => 'Password reset',
        'reset-password' => 'Requested password reset',
        'checkpoint' => 'Two-factor authentication requested',
        'recovery-token' => 'Used two-factor recovery token',
        'token' => 'Solved two-factor challenge',
        'ip-blocked' => 'Blocked request from unlisted IP address for :identifier',
        'sftp' => [
            'fail' => 'Failed SFTP log in',
        ],
    ],
    'node' => [
        'certificate' => [
            'push' => 'Gave a certificate to the node',
        ],
    ],
    'certificate' => [
        'create' => 'Added the certificate :name',
        'replace' => 'Replaced the certificate :name with a new one',
        'update' => 'Changed the certificate :name',
        'delete' => 'Deleted the certificate :name',
    ],
    'role' => [
        'create' => 'Created the role :name',
        'update' => 'Changed the role :name',
        'delete' => 'Deleted the role :name',
        'assign' => 'Gave the role :role to the account',
        'revoke' => 'Took the role :role away from the account',
    ],
    'user' => [
        'user' => [
            'create' => 'Created a new user :email',
            'self-register' => 'Signed up as :username',
        ],
        'account' => [
            'email-changed' => 'Changed email from :old to :new',
            'password-changed' => 'Changed password',
            'passkey-added' => 'Added the passkey :name',
            'passkey-removed' => 'Removed the passkey :name',
            'provider-linked' => 'Linked :provider to the account',
            'provider-unlinked' => 'Unlinked :provider from the account',
        ],
        'api-key' => [
            'create' => 'Created new API key :identifier',
            'delete' => 'Deleted API key :identifier',
        ],
        'ssh-key' => [
            'create' => 'Added SSH key :fingerprint to account',
            'delete' => 'Removed SSH key :fingerprint from account',
        ],
        'two-factor' => [
            'create' => 'Enabled two-factor auth',
            'delete' => 'Disabled two-factor auth',
        ],
    ],
    'server' => [
        'reinstall' => 'Reinstalled server',
        'console' => [
            'command' => 'Executed ":command" on the server',
        ],
        'power' => [
            'start' => 'Started the server',
            'stop' => 'Stopped the server',
            'restart' => 'Restarted the server',
            'kill' => 'Killed the server process',
            'sleep' => 'Stopped the server because nobody was online (auto sleep)',
            'wake' => 'Started the server because a player tried to join (auto sleep)',
        ],
        'backup' => [
            'download' => 'Downloaded the :name backup',
            'delete' => 'Deleted the :name backup',
            'restore' => 'Restored the :name backup (deleted files: :truncate)',
            'restore-complete' => 'Completed restoration of the :name backup',
            'restore-failed' => 'Failed to complete restoration of the :name backup',
            'start' => 'Started a new backup :name',
            'complete' => 'Marked the :name backup as complete',
            'fail' => 'Marked the :name backup as failed',
            'lock' => 'Locked the :name backup',
            'unlock' => 'Unlocked the :name backup',
        ],
        'database' => [
            'create' => 'Created new database :name',
            'rotate-password' => 'Password rotated for database :name',
            'delete' => 'Deleted database :name',
        ],
        'file' => [
            'compress_one' => 'Compressed :directory:files.0',
            'compress_other' => 'Compressed :count files in :directory',
            'read' => 'Viewed the contents of :file',
            'copy' => 'Created a copy of :file',
            'create-directory' => 'Created directory :directory:name',
            'decompress' => 'Decompressed :files in :directory',
            'delete_one' => 'Deleted :directory:files.0',
            'delete_other' => 'Deleted :count files in :directory',
            'download' => 'Downloaded :file',
            'pull' => 'Downloaded a remote file from :url to :directory',
            'rename_one' => 'Renamed :directory:files.0.from to :directory:files.0.to',
            'rename_other' => 'Renamed :count files in :directory',
            'write' => 'Wrote new content to :file',
            'upload' => 'Began a file upload',
            'uploaded' => 'Uploaded :directory:file',
        ],
        'sftp' => [
            'denied' => 'Blocked SFTP access due to permissions',
            'create_one' => 'Created :files.0',
            'create_other' => 'Created :count new files',
            'write_one' => 'Modified the contents of :files.0',
            'write_other' => 'Modified the contents of :count files',
            'delete_one' => 'Deleted :files.0',
            'delete_other' => 'Deleted :count files',
            'create-directory_one' => 'Created the :files.0 directory',
            'create-directory_other' => 'Created :count directories',
            'rename_one' => 'Renamed :files.0.from to :files.0.to',
            'rename_other' => 'Renamed or moved :count files',
        ],
        'domain' => [
            'create' => 'Pointed the domain :domain at :allocation',
            'delete' => 'Removed the domain :domain',
            'web' => 'Changed whether the domain :domain is served over the web',
            'certificate' => 'Asked for a certificate for the domain :domain',
        ],
        'allocation' => [
            'create' => 'Added :allocation to the server',
            'notes' => 'Updated the notes for :allocation from ":old" to ":new"',
            'primary' => 'Set :allocation as the primary server allocation',
            'delete' => 'Deleted the :allocation allocation',
        ],
        'tunnel' => [
            'open' => 'Opened :allocation to the internet through a tunnel',
            'close' => 'Closed a tunnel of the server',
        ],
        'trash' => [
            'restore' => 'Recovered :name from the trash bin',
            'delete' => 'Deleted :name from the trash bin for good',
            'empty' => 'Emptied the trash bin',
        ],
        'schedule' => [
            'create' => 'Created the :name schedule',
            'update' => 'Updated the :name schedule',
            'execute' => 'Manually executed the :name schedule',
            'delete' => 'Deleted the :name schedule',
        ],
        'task' => [
            'create' => 'Created a new ":action" task for the :name schedule',
            'update' => 'Updated the ":action" task for the :name schedule',
            'delete' => 'Deleted a task for the :name schedule',
        ],
        'settings' => [
            'rename' => 'Renamed the server from :old to :new',
            'description' => 'Changed the server description from :old to :new',
            'auto-sleep' => 'Changed auto sleep',
        ],
        'startup' => [
            'edit' => 'Changed the :variable variable from ":old" to ":new"',
            'image' => 'Updated the Docker Image for the server from :old to :new',
            'env' => [
                'set' => 'Set the custom environment variable :variable',
                'delete' => 'Removed the custom environment variable :variable',
            ],
        ],
        'subuser' => [
            'create' => 'Added :email as a subuser',
            'update' => 'Updated the subuser permissions for :email',
            'delete' => 'Removed :email as a subuser',
        ],
    ],
];

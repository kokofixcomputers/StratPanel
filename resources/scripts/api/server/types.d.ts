export type ServerStatus =
    | 'installing'
    | 'install_failed'
    | 'reinstall_failed'
    | 'suspended'
    | 'restoring_backup'
    | null;

/** The copy of a backup in a destination outside the node (see Admin > Settings > Backups). */
export interface ServerBackupCopy {
    destination: number;
    name: string;
    type: 's3' | 'webdav' | 'folder';
    status: 'pending' | 'uploading' | 'stored' | 'failed';
    bytes: number;
}

export interface ServerBackup {
    uuid: string;
    // Whether the file is on the node, it is not once an admin set a destination to take it off the node.
    isLocal: boolean;
    copies: ServerBackupCopy[];
    isSuccessful: boolean;
    isLocked: boolean;
    name: string;
    ignoredFiles: string;
    checksum: string;
    bytes: number;
    createdAt: Date;
    completedAt: Date | null;
}

export interface ServerEggVariable {
    name: string;
    description: string;
    envVariable: string;
    defaultValue: string;
    serverValue: string | null;
    isEditable: boolean;
    rules: string[];
}

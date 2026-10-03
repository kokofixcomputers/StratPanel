/**
 * Client for the public MCJars API (https://mcjars.app). It exposes every server software we care about in one
 * format, including the steps needed to turn a build into a runnable "server.jar" on disk.
 */
const API = 'https://mcjars.app/api/v2';

export type SoftwareType = 'PAPER' | 'FABRIC' | 'NEOFORGE' | 'FORGE' | 'QUILT' | 'PURPUR' | 'SPIGOT' | 'VELOCITY';

export interface Software {
    type: SoftwareType;
    name: string;
    description: string;
}

export const SOFTWARE: Software[] = [
    { type: 'PAPER', name: 'Paper', description: 'High performance Spigot fork with plugin support.' },
    { type: 'PURPUR', name: 'Purpur', description: 'Paper fork with extra gameplay configuration.' },
    { type: 'SPIGOT', name: 'Spigot', description: 'The classic plugin server built on CraftBukkit.' },
    { type: 'FABRIC', name: 'Fabric', description: 'Lightweight, fast-updating modding toolchain.' },
    { type: 'QUILT', name: 'Quilt', description: 'Community-driven fork of the Fabric loader.' },
    { type: 'FORGE', name: 'Forge', description: 'The original Minecraft modding platform.' },
    { type: 'NEOFORGE', name: 'NeoForge', description: 'Modern community-led continuation of Forge.' },
    { type: 'VELOCITY', name: 'Velocity', description: 'Modern, high performance proxy for networks.' },
];

export const iconFor = (type: SoftwareType) => `https://s3.mcjars.app/icons/${type.toLowerCase()}.png`;

export type InstallStep =
    | { type: 'download'; url: string; file: string; size?: number }
    | { type: 'unzip'; file: string; location: string }
    | { type: 'remove'; location: string };

export interface Build {
    id: number;
    name: string;
    versionId: string;
    projectVersionId: string | null;
    buildNumber: number;
    experimental: boolean;
    installation: InstallStep[][];
    changes: string[];
    created: string | null;
}

export interface VersionInfo {
    id: string;
    type: 'RELEASE' | 'SNAPSHOT';
    supported: boolean;
    java: number;
    builds: number;
    latest: Build;
}

const getJson = async (path: string) => {
    const response = await fetch(`${API}${path}`);
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
        throw new Error('MCJars could not be reached, please try again in a moment.');
    }

    return body;
};

/** All Minecraft versions available for a software, newest first. */
export const getVersions = async (type: SoftwareType): Promise<VersionInfo[]> => {
    const { builds } = await getJson(`/builds/${type}`);

    return Object.keys(builds)
        .map((id) => ({ id, ...builds[id] } as VersionInfo))
        .reverse();
};

/** All builds for a single Minecraft version, newest first. */
export const getBuilds = async (type: SoftwareType, version: string): Promise<Build[]> => {
    const { builds } = await getJson(`/builds/${type}/${encodeURIComponent(version)}`);

    return (builds as Build[]).sort((a, b) => b.id - a.id);
};

export const buildLabel = (build: Build): string =>
    build.projectVersionId && build.name !== build.projectVersionId
        ? `${build.projectVersionId} (${build.name})`
        : build.name;

/** Files that a previous installation may have left behind and that would break the new one. */
export const CLEANUP_PATHS = ['server.jar', 'libraries', 'minecraft.jar', 'mcvapi.server.jar.zip'];

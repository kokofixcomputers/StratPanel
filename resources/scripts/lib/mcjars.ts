/**
 * Client for the public MCJars API (https://mcjars.app). It exposes every server software we care about in one
 * format, including the steps needed to turn a build into a runnable "server.jar" on disk.
 */
const API = 'https://mcjars.app/api/v2';

export type SoftwareType =
    | 'PAPER'
    | 'FABRIC'
    | 'NEOFORGE'
    | 'FORGE'
    | 'QUILT'
    | 'PURPUR'
    | 'SPIGOT'
    | 'VELOCITY'
    | 'MOHIST'
    | 'YOUER'
    | 'ARCLIGHT'
    | 'MAGMA';

export interface Software {
    type: SoftwareType;
    name: string;
    description: string;
    // MCJars calls it experimental: it works, but it may break or lag behind, and the panel says so where it is chosen.
    experimental?: boolean;
    // Its builds are for several mod loaders (the name of a build ends in the loader): the loader is chosen after the version.
    loaders?: boolean;
}

export const SOFTWARE: Software[] = [
    { type: 'PAPER', name: 'Paper', description: 'High performance Spigot fork with plugin support.' },
    { type: 'PURPUR', name: 'Purpur', description: 'Paper fork with extra gameplay configuration.' },
    { type: 'SPIGOT', name: 'Spigot', description: 'The classic plugin server built on CraftBukkit.' },
    { type: 'FABRIC', name: 'Fabric', description: 'Lightweight, fast-updating modding toolchain.' },
    { type: 'QUILT', name: 'Quilt', description: 'Community-driven fork of the Fabric loader.', experimental: true },
    { type: 'FORGE', name: 'Forge', description: 'The original Minecraft modding platform.' },
    { type: 'NEOFORGE', name: 'NeoForge', description: 'Modern community-led continuation of Forge.' },
    { type: 'VELOCITY', name: 'Velocity', description: 'Modern, high performance proxy for networks.' },
    {
        type: 'MOHIST',
        name: 'Mohist',
        description: 'Forge or NeoForge that also loads Spigot plugins next to the mods.',
    },
    { type: 'YOUER', name: 'Youer', description: 'NeoForge that also loads Spigot plugins next to the mods.' },
    { type: 'MAGMA', name: 'Magma', description: 'NeoForge that also loads Spigot plugins next to the mods.' },
    {
        type: 'ARCLIGHT',
        name: 'Arclight',
        description: 'A Bukkit server built with Mixins, for mods and plugins on Fabric, Forge or NeoForge.',
        loaders: true,
    },
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

export type ModLoader = 'fabric' | 'neoforge' | 'forge';

export const MOD_LOADER_INFO: Record<ModLoader, { name: string; description: string }> = {
    fabric: { name: 'Fabric', description: 'Light and fast, most new mods.' },
    neoforge: { name: 'NeoForge', description: 'The modern continuation of Forge.' },
    forge: { name: 'Forge', description: 'The classic mod loader, many older mods.' },
};

/** The mod loader a build is for, from the end of its name ("1.0.0-SNAPSHOT-6933aad-fabric"). Null when the name does not say. */
export const loaderOfBuild = (build: Pick<Build, 'name' | 'projectVersionId'>): ModLoader | null => {
    for (const text of [build.name, build.projectVersionId]) {
        const match = /-(neoforge|fabric|forge)$/i.exec(text || '');
        if (match) return match[1].toLowerCase() as ModLoader;
    }

    return null;
};

/** The loaders the builds of a version are for, the one of the newest build first. */
export const loadersOfBuilds = (builds: Pick<Build, 'name' | 'projectVersionId'>[]): ModLoader[] => {
    const found: ModLoader[] = [];
    for (const build of builds) {
        const loader = loaderOfBuild(build);
        if (loader && !found.includes(loader)) found.push(loader);
    }

    return found;
};

export const buildLabel = (build: Build): string =>
    build.projectVersionId && build.name !== build.projectVersionId
        ? `${build.projectVersionId} (${build.name})`
        : build.name;

/** Files that a previous installation may have left behind and that would break the new one. */
export const CLEANUP_PATHS = ['server.jar', 'libraries', 'minecraft.jar', 'mcvapi.server.jar.zip'];

import { Build, buildLabel, VersionInfo } from '@/lib/mcjars';

/** How many cards are drawn before "Show all": a software can have hundreds of versions and thousands of builds. */
export const VERSION_CAP = 24;
export const BUILD_CAP = 12;

/** The versions whose name has the search in it ("1.21" finds 1.21, 1.21.1 ... and nothing of 1.2.x). Newest first, as they came. */
export const filterVersions = (versions: VersionInfo[], query: string): VersionInfo[] => {
    const q = query.trim().toLowerCase();

    return q === '' ? versions : versions.filter((version) => version.id.toLowerCase().includes(q));
};

/** The builds whose label (its number or name, like "123 (abc)") has the search in it. */
export const filterBuilds = (builds: Build[], query: string): Build[] => {
    const q = query.trim().toLowerCase().replace(/^#/, '');

    return q === '' ? builds : builds.filter((build) => buildLabel(build).toLowerCase().includes(q));
};

/** What is drawn of a list: all of it, or the first `cap` entries. */
export const capped = <T>(list: T[], cap: number, all: boolean): T[] => (all ? list : list.slice(0, cap));

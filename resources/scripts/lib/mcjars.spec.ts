import { iconFor, isMinecraftVersion, SOFTWARE, loaderOfBuild, loadersOfBuilds } from '@/lib/mcjars';

describe('SOFTWARE', () => {
    it('has the hybrid servers, one of each', () => {
        const types = SOFTWARE.map((s) => s.type);
        for (const type of ['MOHIST', 'YOUER', 'MAGMA', 'ARCLIGHT'] as const)
            expect(types.filter((t) => t === type)).toHaveLength(1);
        expect(iconFor('MOHIST')).toBe('https://s3.mcjars.app/icons/mohist.png');
    });

    it('marks Quilt as experimental and nothing else', () => {
        expect(SOFTWARE.filter((s) => s.experimental).map((s) => s.type)).toEqual(['QUILT']);
    });

    it('has names that fit what the panel keeps for a software (banners, announcements)', () => {
        for (const s of SOFTWARE) expect(s.type).toMatch(/^[A-Z]{3,12}$/);
    });
});

describe('the mod loader of a build (Arclight)', () => {
    const named = (name: string, projectVersionId: string | null = null) => ({ name, projectVersionId });

    it('is the end of the name of the build', () => {
        expect(loaderOfBuild(named('1.0.0-SNAPSHOT-6933aad-fabric'))).toBe('fabric');
        expect(loaderOfBuild(named('1.0.0-SNAPSHOT-6933aad-neoforge'))).toBe('neoforge');
        expect(loaderOfBuild(named('1.0.26-SNAPSHOT-5c6b795-forge'))).toBe('forge');
        expect(loaderOfBuild(named('1.0.12-fded76e5-FORGE'))).toBe('forge');
    });

    it('reads neoforge as neoforge, not as forge', () => {
        expect(loaderOfBuild(named('1.0.0-neoforge'))).toBe('neoforge');
    });

    it('falls back to the project version, and is null when nothing says', () => {
        expect(loaderOfBuild(named('build 12', '1.0.0-abc-fabric'))).toBe('fabric');
        expect(loaderOfBuild(named('Paper-130'))).toBeNull();
        expect(loaderOfBuild(named('fabric-loader-0.16'))).toBeNull();
    });

    it('lists the loaders of a version, the newest first, once each', () => {
        const builds = [
            '1.0.0-SNAPSHOT-6933aad-fabric',
            '1.0.0-SNAPSHOT-6933aad-neoforge',
            '1.0.0-SNAPSHOT-67f4212-fabric',
            '1.0.0-SNAPSHOT-67f4212-neoforge',
        ].map((name) => named(name));
        expect(loadersOfBuilds(builds)).toEqual(['fabric', 'neoforge']);
        expect(loadersOfBuilds([named('1.0.26-5c6b795-forge'), named('1.0.25-7cf92be3-forge')])).toEqual(['forge']);
        expect(loadersOfBuilds([])).toEqual([]);
    });

    it('is only asked for by Arclight', () => {
        expect(SOFTWARE.filter((software) => software.loaders).map((software) => software.type)).toEqual(['ARCLIGHT']);
    });
});

describe('isMinecraftVersion', () => {
    it('knows a Minecraft version from the version of other software', () => {
        ['1.21.1', '1.8', '26.1', '26.1.2', '27.3'].forEach((v) => expect(isMinecraftVersion(v)).toBe(true));
        // Velocity, NanoLimbo and the like have versions of their own.
        ['3.4.0-SNAPSHOT', '3.3.0', '2.0', '0.9', 'latest', ''].forEach((v) =>
            expect(isMinecraftVersion(v)).toBe(false)
        );
    });
});

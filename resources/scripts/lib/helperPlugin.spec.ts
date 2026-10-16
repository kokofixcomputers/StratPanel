import { bundledHelperVersion, helperBuild, wantsHelper } from '@/lib/helperPlugin';

const respond = (body: unknown, ok = true) => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok, json: async () => body });
};

describe('lib/helperPlugin', () => {
    describe('helperBuild', () => {
        it('puts the plugin in the plugins folder for Paper, Spigot and Purpur', () => {
            ['PAPER', 'SPIGOT', 'PURPUR', 'paper', 'Purpur'].forEach((software) =>
                expect(helperBuild(software)).toEqual({ file: 'Stratosphere.jar', folder: '/plugins', key: null })
            );
        });

        it('puts a mod in the mods folder for Fabric and NeoForge, any capitalisation', () => {
            expect(helperBuild('FABRIC')).toEqual({ file: 'Stratosphere-fabric.jar', folder: '/mods', key: 'fabric' });
            expect(helperBuild('neoforge')).toEqual({
                file: 'Stratosphere-neoforge.jar',
                folder: '/mods',
                key: 'neoforge',
            });
        });

        it('has nothing for software that is not supported', () => {
            expect(helperBuild('FORGE')).toBeNull();
            expect(helperBuild('VELOCITY')).toBeNull();
            expect(helperBuild(null)).toBeNull();
            expect(helperBuild(undefined)).toBeNull();
            expect(helperBuild('')).toBeNull();
        });
    });

    describe('wantsHelper', () => {
        it('is true for the software that has a helper', () => {
            expect(['PAPER', 'FABRIC', 'NEOFORGE', 'SPIGOT', 'PURPUR'].every(wantsHelper)).toBe(true);
        });

        it('is false for the rest', () => {
            expect(['FORGE', 'QUILT', 'VELOCITY', '', null, undefined].some(wantsHelper)).toBe(false);
        });
    });

    describe('bundledHelperVersion', () => {
        const info = {
            version: '261015-2134-SNAPSHOT',
            file: 'Stratosphere.jar',
            mods: { fabric: { version: '2.0.0', file: 'Stratosphere-fabric.jar' }, neoforge: { version: '2.0.1' } },
        };

        it('reads the plugin version from the top level', async () => {
            respond(info);
            expect(await bundledHelperVersion('PAPER')).toBe('261015-2134-SNAPSHOT');
            expect(await bundledHelperVersion()).toBe('261015-2134-SNAPSHOT');
        });

        it('reads the version of the mod for the loader', async () => {
            respond(info);
            expect(await bundledHelperVersion('fabric')).toBe('2.0.0');
            expect(await bundledHelperVersion('NEOFORGE')).toBe('2.0.1');
        });

        it('is null for a panel that ships no mods, an unknown loader or a broken file', async () => {
            respond({ version: '1' });
            expect(await bundledHelperVersion('FABRIC')).toBeNull();
            respond(info);
            expect(await bundledHelperVersion('FORGE')).toBeNull();
            respond(info, false);
            expect(await bundledHelperVersion('PAPER')).toBeNull();
            (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));
            expect(await bundledHelperVersion('PAPER')).toBeNull();
            respond({ version: 5 });
            expect(await bundledHelperVersion('PAPER')).toBeNull();
        });
    });
});

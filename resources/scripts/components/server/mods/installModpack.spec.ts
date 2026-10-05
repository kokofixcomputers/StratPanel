import { loaderOf } from './installModpack';

describe('modpack loader detection', () => {
    it('finds the loader and Minecraft version of a pack', () => {
        expect(loaderOf({ dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.9' }, files: [] })).toEqual({
            type: 'FABRIC',
            version: '0.16.9',
            minecraft: '1.21.1',
        });
        expect(loaderOf({ dependencies: { minecraft: '1.20.1', forge: '47.4.0' }, files: [] }).type).toBe('FORGE');
        expect(loaderOf({ dependencies: { minecraft: '1.21.1', neoforge: '21.1.172' }, files: [] }).type).toBe(
            'NEOFORGE'
        );
        expect(loaderOf({ dependencies: { minecraft: '1.20.1', 'quilt-loader': '0.26.0' }, files: [] }).type).toBe(
            'QUILT'
        );
    });

    it('rejects packs without a supported loader', () => {
        expect(() => loaderOf({ dependencies: { minecraft: '1.20.1' }, files: [] })).toThrow();
    });
});

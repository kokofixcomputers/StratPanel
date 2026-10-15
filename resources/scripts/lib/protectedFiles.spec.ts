import { protectedFiles } from './protectedFiles';

describe('files the panel depends on', () => {
    it('recognises the panel files in the server root', () => {
        expect(
            protectedFiles('/', [
                'server.properties',
                'stratosphere.json',
                'stratosphere.commands.json',
                'pterodactyl.json',
                'pterodactyl.commands.json',
            ]).map((f) => f.name)
        ).toEqual(['stratosphere.json', 'stratosphere.commands.json', 'pterodactyl.json', 'pterodactyl.commands.json']);
    });

    it('recognises the helper plugin only in the plugins folder', () => {
        expect(
            protectedFiles('/plugins', [
                'Stratosphere.jar',
                'StratPanel.jar',
                'StratPanel-1.2.jar',
                'StratPanel',
                'EssentialsX.jar',
            ]).map((f) => f.name)
        ).toEqual(['Stratosphere.jar', 'StratPanel.jar', 'StratPanel-1.2.jar', 'StratPanel']);
        expect(protectedFiles('/mods', ['StratPanel.jar'])).toEqual([]);
        // The same name somewhere else is just a file.
        expect(protectedFiles('/world', ['pterodactyl.json'])).toEqual([]);
    });
});

import { fileNameOf, folderNameFor, isValidFolderName } from './worldImport';

describe('world import helpers', () => {
    it('reads the file name from a link', () => {
        expect(fileNameOf('https://example.com/maps/Cool%20Map.zip?dl=1')).toBe('Cool Map.zip');
        expect(fileNameOf('not a link')).toBe('');
    });

    it('makes a safe folder name from an archive name', () => {
        expect(folderNameFor('Cool Map (v2).zip')).toBe('Cool-Map-v2');
        expect(folderNameFor('world.tar.gz')).toBe('world');
        expect(isValidFolderName('Cool-Map_2')).toBe(true);
        expect(isValidFolderName('../etc')).toBe(false);
        expect(isValidFolderName('')).toBe(false);
    });
});

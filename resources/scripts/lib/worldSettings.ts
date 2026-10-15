/**
 * The settings of a new world live in server.properties: where the world is (level-name), how it is made (level-seed,
 * level-type, generator-settings, generate-structures) and hardcore. They only apply when a world is generated.
 */
import { parseWorldType, worldTypeProperties, WorldType } from '@/lib/worldType';
import { isSafeSegment } from '@/lib/dimensionNames';

export interface WorldSettings {
    // The folder of the world.
    name: string;
    seed: string;
    type: WorldType;
    // The generator-settings of a Superflat world, as JSON. Empty for the game's own layers.
    layers: string;
    structures: boolean;
    hardcore: boolean;
}

export const WORLD_KEYS = [
    'level-name',
    'level-seed',
    'level-type',
    'generator-settings',
    'generate-structures',
    'hardcore',
] as const;

/** The settings out of the values of server.properties. A type the page does not know (a custom one) shows as Default. */
export const readWorldSettings = (values: Record<string, string>): WorldSettings => ({
    name: values['level-name']?.trim() || 'world',
    seed: values['level-seed']?.trim() || '',
    type: parseWorldType(values['level-type'] || '') || 'normal',
    layers: values['generator-settings']?.trim() || '',
    structures: (values['generate-structures'] ?? 'true').trim().toLowerCase() !== 'false',
    hardcore: (values.hardcore ?? 'false').trim().toLowerCase() === 'true',
});

/** What is wrong with the settings, null when they can be saved. */
export const validateWorldSettings = (settings: WorldSettings): string | null => {
    if (!isSafeSegment(settings.name) || settings.name.length > 48) {
        return 'The folder name can only have letters, numbers, dots, dashes and underscores.';
    }
    if (settings.type === 'flat' && settings.layers) {
        try {
            const parsed = JSON.parse(settings.layers);
            if (!parsed || typeof parsed !== 'object') throw new Error();
        } catch (e) {
            return 'The Superflat layers are not valid.';
        }
    }

    return null;
};

/** The lines to write to server.properties. The current type and layers are kept in the style the file already has. */
export const worldProperties = (
    settings: WorldSettings,
    current: { levelType: string; generatorSettings: string }
): Record<string, string> => {
    // 'custom' keeps the old layers, the real ones are set below for Superflat.
    const values = worldTypeProperties(settings.type, settings.type === 'flat' ? 'custom' : '', current);
    if (settings.type === 'flat') values['generator-settings'] = settings.layers || '{}';

    return {
        'level-name': settings.name,
        'level-seed': settings.seed.trim().replace(/[\r\n]+/g, ' '),
        'generate-structures': String(settings.structures),
        hardcore: String(settings.hardcore),
        ...values,
    };
};

/** The folders of a world on disk: the world, and the Nether and End folders Paper keeps beside it. */
export const worldFolders = (name: string, existing: Set<string>): string[] =>
    [name, `${name}_nether`, `${name}_the_end`].filter((folder) => existing.has(folder));

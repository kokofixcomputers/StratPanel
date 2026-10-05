import { useCallback, useEffect, useState } from 'react';
import saveFileContents from '@/api/server/files/saveFileContents';
import { parseProperties, readOptionalFile, serializeProperties } from '@/lib/minecraft';
import { ModrinthProject, ModrinthVersion, primaryFile } from '@/lib/minecraft';
import { ResourcePackInfo, updatePterodactylJson, readPterodactylJson } from '@/lib/pterodactylJson';

const FILE = '/server.properties';

export interface ActiveResourcePack {
    url: string;
    sha1: string;
    required: boolean;
    // What the panel knows about it, missing when the pack was set by hand.
    info: ResourcePackInfo | null;
}

/** The properties that make a server hand out a resource pack, kept in sync with what the panel installed. */
export const packProperties = (url: string, sha1: string, required: boolean): Record<string, string> => ({
    'resource-pack': url,
    'resource-pack-sha1': sha1,
    'require-resource-pack': required ? 'true' : 'false',
});

export default (uuid: string) => {
    const [pack, setPack] = useState<ActiveResourcePack | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const [properties, json] = await Promise.all([readOptionalFile(uuid, FILE), readPterodactylJson(uuid)]);
        const values = Object.fromEntries(parseProperties(properties || '').map((l) => [l.key, l.value.trim()]));
        const url = values['resource-pack'] || '';

        setPack(
            url
                ? {
                      url,
                      sha1: values['resource-pack-sha1'] || '',
                      required: values['require-resource-pack'] === 'true',
                      // Only trust the saved details when they describe the pack that is set.
                      info: json.resourcePack && json.resourcePack.url === url ? json.resourcePack : null,
                  }
                : null
        );
        setLoading(false);
    }, [uuid]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const write = async (values: Record<string, string>) => {
        const current = (await readOptionalFile(uuid, FILE)) || '';
        await saveFileContents(uuid, FILE, serializeProperties(current, values));
    };

    const apply = async (project: ModrinthProject, version: ModrinthVersion, required: boolean) => {
        const file = primaryFile(version);
        if (!file.hashes?.sha1) throw new Error('Modrinth did not give a checksum for this file.');

        await write(packProperties(file.url, file.hashes.sha1, required));
        await updatePterodactylJson(uuid, (current) => ({
            ...current,
            resourcePack: {
                projectId: project.project_id,
                title: project.title,
                icon: project.icon_url,
                versionId: version.id,
                versionNumber: version.version_number,
                url: file.url,
                sha1: file.hashes!.sha1!,
                required,
                installedAt: new Date().toISOString(),
            },
        }));
        await refresh();
    };

    const setRequired = async (required: boolean) => {
        await write({ 'require-resource-pack': required ? 'true' : 'false' });
        if (pack?.info) {
            await updatePterodactylJson(uuid, (current) => ({
                ...current,
                resourcePack: current.resourcePack && { ...current.resourcePack, required },
            }));
        }
        await refresh();
    };

    const remove = async () => {
        await write(packProperties('', '', false));
        await updatePterodactylJson(uuid, (current) => {
            const { resourcePack, ...rest } = current; // eslint-disable-line @typescript-eslint/no-unused-vars

            return rest;
        });
        await refresh();
    };

    return { pack, loading, apply, setRequired, remove, refresh };
};

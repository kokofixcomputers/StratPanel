/**
 * The StratPanel helper plugin is shipped with the panel (public/helper) and put into the plugins folder of servers
 * that run Paper or Spigot. It is uploaded from the browser, which works whatever the network between the node and the
 * panel looks like.
 */
import axios from 'axios';
import createDirectory from '@/api/server/files/createDirectory';
import deleteFiles from '@/api/server/files/deleteFiles';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl';
import loadDirectory from '@/api/server/files/loadDirectory';

export const HELPER_FILE = 'StratPanel.jar';
// Purpur is a Paper fork and loads the same plugin.
export const HELPER_SOFTWARE = ['PAPER', 'SPIGOT', 'PURPUR'];

export const wantsHelper = (software: string | null | undefined): boolean =>
    !!software && HELPER_SOFTWARE.includes(software.toUpperCase());

/** Puts the bundled plugin into /plugins, replacing an older copy of itself. */
export const installHelperPlugin = async (uuid: string): Promise<void> => {
    const response = await fetch(`/helper/${HELPER_FILE}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('The helper plugin is not part of this panel.');
    const jar = new File([await response.blob()], HELPER_FILE, { type: 'application/java-archive' });

    await createDirectory(uuid, '/', 'plugins').catch(() => undefined);

    // Older builds may have another file name, two copies of the plugin would fight over the same command.
    const existing = await loadDirectory(uuid, '/plugins').catch(() => []);
    const stale = existing.filter((f) => f.isFile && /^stratpanel.*\.jar$/i.test(f.name) && f.name !== HELPER_FILE);
    if (stale.length)
        await deleteFiles(
            uuid,
            '/plugins',
            stale.map((f) => f.name)
        ).catch(() => undefined);

    const url = await getFileUploadUrl(uuid);
    await axios.post(
        url,
        { files: jar },
        { headers: { 'Content-Type': 'multipart/form-data' }, params: { directory: '/plugins' } }
    );
};

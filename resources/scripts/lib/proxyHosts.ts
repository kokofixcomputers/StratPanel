/**
 * Domains on a proxy choose which backend server players land on. Velocity calls this a forced host, it lives in
 * velocity.toml under [forced-hosts], so these helpers read and update just that part of the file.
 */
import saveFileContents from '@/api/server/files/saveFileContents';
import { readOptionalFile } from '@/lib/minecraft';
import { ProxyConfig, parseVelocity, serializeVelocity, uid } from '@/lib/velocity';

const FILE = '/velocity.toml';

export interface ProxyHosts {
    config: ProxyConfig;
    raw: string;
}

export const readProxyHosts = async (uuid: string): Promise<ProxyHosts | null> => {
    const raw = await readOptionalFile(uuid, FILE);

    return raw === null ? null : { raw, config: parseVelocity(raw) };
};

/** Maps each domain to the name of the server it is forced to, domains without one are left out. */
export const forcedServerByHost = (config: ProxyConfig): Record<string, string> =>
    Object.fromEntries(config.forcedHosts.filter((f) => f.servers[0]).map((f) => [f.host.toLowerCase(), f.servers[0]]));

/** Sets (or with null clears) the server a domain is forced to. Returns whether the file changed. */
export const setForcedHost = async (uuid: string, host: string, server: string | null): Promise<boolean> => {
    const current = await readProxyHosts(uuid);
    if (!current) return false;

    const others = current.config.forcedHosts.filter((f) => f.host.toLowerCase() !== host.toLowerCase());
    const forcedHosts = server ? [...others, { id: uid(), host, servers: [server] }] : others;
    if (
        JSON.stringify(forcedHosts.map((f) => [f.host, f.servers])) ===
        JSON.stringify(current.config.forcedHosts.map((f) => [f.host, f.servers]))
    ) {
        return false;
    }

    await saveFileContents(uuid, FILE, serializeVelocity(current.raw, { ...current.config, forcedHosts }));

    return true;
};

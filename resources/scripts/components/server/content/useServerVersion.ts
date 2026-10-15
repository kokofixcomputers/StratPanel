import { ServerContext } from '@/state/server';

/** The Minecraft version the egg variables of the server say it runs, empty when they do not say. */
export default (): string =>
    ServerContext.useStoreState(
        (state) =>
            state.server.data!.variables.find(
                (v) =>
                    ['MC_VERSION', 'MINECRAFT_VERSION', 'VERSION'].includes(v.envVariable) &&
                    /^\d+\.\d+/.test(v.serverValue || '')
            )?.serverValue || ''
    );

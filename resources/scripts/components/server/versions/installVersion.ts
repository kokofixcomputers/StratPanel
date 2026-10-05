import http from '@/api/http';
import pullFile from '@/api/server/files/pullFile';
import deleteFiles from '@/api/server/files/deleteFiles';
import decompressFiles from '@/api/server/files/decompressFiles';
import updateStartupVariable from '@/api/server/updateStartupVariable';
import setSelectedDockerImage from '@/api/server/setSelectedDockerImage';
import { Websocket } from '@/plugins/Websocket';
import { writeMarker } from '@/components/server/versions/detectCurrent';
import { installHelperPlugin, wantsHelper } from '@/lib/helperPlugin';
import { Build, CLEANUP_PATHS, InstallStep, Software, VersionInfo } from '@/lib/mcjars';

export type StepState = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface ProgressStep {
    key: string;
    label: string;
    state: StepState;
    detail?: string;
}

interface Context {
    uuid: string;
    status: string | null;
    instance: Websocket | null;
    software: Software;
    version: VersionInfo;
    build: Build;
    onProgress: (steps: ProgressStep[]) => void;
}

const waitForOffline = (instance: Websocket, timeout: number): Promise<boolean> =>
    new Promise((resolve) => {
        const handlers: { timer?: ReturnType<typeof setTimeout>; listener?: (state: string) => void } = {};
        const finish = (result: boolean) => {
            handlers.timer && clearTimeout(handlers.timer);
            handlers.listener && instance.removeListener('status', handlers.listener);
            resolve(result);
        };

        handlers.listener = (state: string) => state === 'offline' && finish(true);
        handlers.timer = setTimeout(() => finish(false), timeout);
        instance.addListener('status', handlers.listener);
    });

const directoryOf = (location: string) =>
    location === '.' || location === '' ? '/' : `/${location.replace(/^\/+/, '')}`;

const describe = (step: InstallStep): string =>
    step.type === 'download'
        ? `Downloading ${step.file}`
        : step.type === 'unzip'
        ? `Extracting ${step.file}`
        : `Removing ${step.location}`;

export const flattenSteps = (build: Build): InstallStep[] =>
    build.installation.reduce((all, group) => all.concat(group), []);

/**
 * Stops the server, wipes the previous jar and libraries and runs the install recipe published for the build.
 */
export default async (ctx: Context): Promise<void> => {
    const steps: ProgressStep[] = [
        { key: 'stop', label: 'Stopping the server', state: 'pending' },
        { key: 'clean', label: 'Removing the previous server files', state: 'pending' },
        ...flattenSteps(ctx.build).map((step, index) => ({
            key: `step-${index}`,
            label: describe(step),
            state: 'pending' as StepState,
        })),
        { key: 'config', label: 'Updating the startup configuration', state: 'pending' },
        // Servers that load plugins get the helper plugin, without asking.
        ...(wantsHelper(ctx.software.type)
            ? [{ key: 'helper', label: 'Installing the helper plugin', state: 'pending' as StepState }]
            : []),
    ];

    const update = (key: string, state: StepState, detail?: string) => {
        const step = steps.find((s) => s.key === key)!;
        step.state = state;
        step.detail = detail;
        ctx.onProgress(steps.map((s) => ({ ...s })));
    };

    const run = async (key: string, task: () => Promise<void>, optional = false) => {
        update(key, 'running');
        try {
            await task();
            update(key, 'done');
        } catch (error) {
            if (!optional) {
                update(key, 'failed', (error as any)?.response?.data?.errors?.[0]?.detail || (error as Error).message);
                throw error;
            }
            update(key, 'skipped');
        }
    };

    ctx.onProgress(steps.map((s) => ({ ...s })));

    await run('stop', async () => {
        if (!ctx.instance || ctx.status === 'offline') return;

        ctx.instance.send('set state', 'stop');
        if (!(await waitForOffline(ctx.instance, 45000))) {
            ctx.instance.send('set state', 'kill');
            if (!(await waitForOffline(ctx.instance, 15000))) {
                throw new Error('The server did not shut down in time.');
            }
        }
    });

    await run('clean', async () => {
        // Missing files are fine here, we only want to make sure nothing stale remains.
        await Promise.all(CLEANUP_PATHS.map((path) => deleteFiles(ctx.uuid, '/', [path]).catch(() => undefined)));
    });

    const recipe = flattenSteps(ctx.build);
    for (let index = 0; index < recipe.length; index++) {
        const step = recipe[index];

        await run(`step-${index}`, async () => {
            if (step.type === 'download') {
                await pullFile(ctx.uuid, step.url, '/', step.file);
            } else if (step.type === 'unzip') {
                await decompressFiles(ctx.uuid, directoryOf(step.location), step.file);
            } else {
                await deleteFiles(ctx.uuid, '/', [step.location]);
            }
        });
    }

    await run(
        'config',
        async () => {
            await writeMarker(ctx.uuid, {
                software: ctx.software.type,
                name: ctx.software.name,
                minecraftVersion: ctx.version.id,
                build: ctx.build.projectVersionId || ctx.build.name,
                java: ctx.version.java,
            }).catch(() => undefined);

            const { data } = await http.get(`/api/client/servers/${ctx.uuid}/startup`);

            // Keep the egg's own variables in sync so a later reinstall doesn't jump back to another version.
            const variables: { env_variable: string; is_editable: boolean }[] = (data.data || []).map(
                (v: any) => v.attributes
            );
            const editable = (name: string) => variables.find((v) => v.env_variable === name && v.is_editable);
            await Promise.all([
                ...['MC_VERSION', 'MINECRAFT_VERSION', 'VERSION']
                    .filter(editable)
                    .map((name) => updateStartupVariable(ctx.uuid, name, ctx.version.id).catch(() => undefined)),
                editable('SERVER_JARFILE')
                    ? updateStartupVariable(ctx.uuid, 'SERVER_JARFILE', 'server.jar').catch(() => undefined)
                    : null,
            ]);

            // Pick the Java image the new version needs, when the egg offers one.
            const images: Record<string, string> = data.meta?.docker_images || {};
            const match = Object.values(images).find((image) =>
                new RegExp(`java[_:-]?${ctx.version.java}(?!\\d)`, 'i').test(image)
            );
            if (match) await setSelectedDockerImage(ctx.uuid, match).catch(() => undefined);
        },
        true
    );

    // Optional: a server without the helper plugin works, it only misses some conveniences.
    if (wantsHelper(ctx.software.type)) {
        await run('helper', () => installHelperPlugin(ctx.uuid), true);
    }
};

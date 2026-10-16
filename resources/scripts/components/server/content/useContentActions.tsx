import React, { useState } from 'react';
import { ServerContext } from '@/state/server';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import { runTask } from '@/lib/tasks';
import { ManagedProject } from '@/lib/pterodactylJson';
import { ModrinthProject, ModrinthVersion, ProjectKind } from '@/lib/minecraft';
import { PlannedDependency } from '@/lib/modDependencies';
import useManagedMods from '@/components/server/mods/useManagedMods';
import useResourcePack from '@/components/server/mods/useResourcePack';
import installModpack, { ModpackSpec } from '@/components/server/mods/installModpack';
import { InstallModpackModal } from '@/components/server/mods/modpack';
import InstallContentModal from '@/components/server/mods/InstallContentModal';
import InstallWorldModal, { WorldChoice } from '@/components/server/mods/InstallWorldModal';
import { installWorldFromLink } from '@/lib/worldImport';
import useContentQuery from '@/components/server/content/useContentQuery';
import useServerVersion from '@/components/server/content/useServerVersion';

/**
 * Everything that changes the server from the Content pages: installing, updating and removing projects, with the dialogs
 * that belong to it. The list of results and the page of a project both use it, so they do exactly the same thing.
 * Whatever the actions have to say is flashed under the "mods" key.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const detectedVersion = useServerVersion();
    const { query } = useContentQuery(detectedVersion);
    const { addFlash, clearFlashes } = useFlash();

    const managed = useManagedMods(uuid, detectedVersion);
    const resourcePack = useResourcePack(uuid);

    const [busy, setBusy] = useState<string | null>(null);
    const [removing, setRemoving] = useState<ManagedProject | null>(null);
    const [modpack, setModpack] = useState<ModrinthProject | null>(null);
    const [world, setWorld] = useState<ModrinthProject | null>(null);
    const [installing, setInstalling] = useState<{
        project: ModrinthProject;
        kind: ProjectKind;
        versionId?: string;
    } | null>(null);

    /** "Sodium 0.6.13", without saying the name twice for versions that are called "Sodium 0.6.13" already. */
    const named = (title: string, version: string) =>
        version.toLowerCase().startsWith(title.toLowerCase()) ? version : `${title} ${version}`;

    /** Runs one action on a project and shows what happened. */
    const act = async (project: { id: string }, work: () => Promise<string>) => {
        setBusy(project.id);
        clearFlashes('mods');
        try {
            addFlash({ key: 'mods', type: 'success', message: await work() });
        } catch (error) {
            addFlash({
                key: 'mods',
                type: 'error',
                message: (error as any)?.response ? httpErrorToHuman(error) : (error as Error).message,
            });
        } finally {
            setBusy(null);
        }
    };

    /** Called by the dialog once a version was chosen and confirmed. */
    const confirmInstall = async (
        version: ModrinthVersion,
        options: { required: boolean; dependencies: PlannedDependency[] }
    ) => {
        if (!installing) return;
        const { project, kind } = installing;
        if (kind === 'modpack') return;

        await act({ id: project.project_id }, async () => {
            if (kind === 'resourcepack') {
                await resourcePack.apply(project, version, options.required);

                return `${project.title} is now the resource pack of the server${
                    options.required ? ' and players are required to use it' : ''
                }. Restart the server to hand it out.`;
            }

            const { record, dependencies } = await managed.install(
                project,
                kind,
                version,
                version.game_versions.includes(detectedVersion) ? detectedVersion : null,
                options.dependencies
            );
            const extra = dependencies.length
                ? ` It needs ${dependencies.map((d) => d.title).join(', ')}, which ${
                      dependencies.length === 1 ? 'was' : 'were'
                  } installed with it.`
                : '';

            return (
                (kind === 'datapack'
                    ? `${named(project.title, record.versionNumber)} was added to ${
                          record.directory
                      }. Restart the server or run /reload to load it.`
                    : `${named(project.title, record.versionNumber)} was downloaded to ${
                          record.directory
                      }. Restart the server to load it.`) + extra
            );
        });
        setInstalling(null);
    };

    const update = (record: ManagedProject) =>
        act({ id: record.projectId }, async () => {
            await managed.update(record.projectId);

            return `${record.title} was updated. Restart the server to load the new version.`;
        });

    const uninstall = async () => {
        const record = removing;
        setRemoving(null);
        if (!record) return;

        await act({ id: record.projectId }, async () => {
            await managed.uninstall(record.projectId);

            return `${record.title} was removed. Restart the server for it to unload.`;
        });
    };

    const startModpack = (spec: ModpackSpec) => {
        setModpack(null);
        addFlash({
            key: 'mods',
            type: 'info',
            message: `Installing ${spec.title} in the background, follow it in the task menu at the bottom right.`,
        });
        runTask('modpack', `Installing ${spec.title}`, (report) =>
            installModpack({ uuid, status, instance, spec, report })
        );
    };

    /** A world of CurseForge is downloaded and unpacked in the background, like one from a link. */
    const startWorld = (choice: WorldChoice) => {
        const title = world?.title || choice.name;
        setWorld(null);
        addFlash({
            key: 'mods',
            type: 'info',
            message: `Installing ${title} in the background, follow it in the task menu at the bottom right.`,
        });
        runTask('extract', `Installing world ${choice.name}`, (report) =>
            installWorldFromLink({ uuid, link: choice.link, name: choice.name, makeActive: choice.makeActive, report })
        );
    };

    const dialogs = (
        <>
            <Dialog.Confirm
                open={!!removing}
                onClose={() => setRemoving(null)}
                title={`Uninstall ${removing?.title}?`}
                confirm={'Uninstall'}
                onConfirmed={uninstall}
            >
                <span className={'font-mono'}>{removing?.file}</span> will be deleted from the server. Other mods or
                plugins that need it may stop working.
            </Dialog.Confirm>

            <InstallContentModal
                project={installing?.project || null}
                kind={installing?.kind || 'mod'}
                loader={query.loader || undefined}
                gameVersion={query.version || detectedVersion}
                confirmLabel={installing?.kind === 'resourcepack' ? 'Use this pack' : 'Install'}
                allowRequire={installing?.kind === 'resourcepack'}
                replaces={installing?.kind === 'resourcepack' && !!resourcePack.pack}
                busy={!!busy}
                installed={Object.keys(managed.mods)}
                present={{
                    projects: Object.values(managed.mods).map((r) => ({
                        projectId: r.projectId,
                        title: r.title,
                        slug: r.slug,
                    })),
                    // Jars of the folder of this kind that were not installed from here.
                    files: managed.untracked
                        .filter((f) => f.directory === (installing?.kind === 'plugin' ? '/plugins' : '/mods'))
                        .map((f) => f.file),
                }}
                versionId={installing?.versionId}
                onClose={() => setInstalling(null)}
                onConfirm={confirmInstall}
            />
            <InstallModpackModal project={modpack} onClose={() => setModpack(null)} onInstall={startModpack} />
            <InstallWorldModal
                project={world}
                offline={status === 'offline'}
                gameVersion={query.version || detectedVersion}
                onClose={() => setWorld(null)}
                onConfirm={startWorld}
            />
        </>
    );

    return {
        managed,
        resourcePack,
        busy,
        detectedVersion,
        /** Opens the dialog to install a project, the one for modpacks when it is one. */
        install: (project: ModrinthProject, kind: ProjectKind, versionId?: string) =>
            kind === 'modpack' ? setModpack(project) : setInstalling({ project, kind, versionId }),
        /** Opens the dialog to install a world (they only come from CurseForge). */
        installWorld: (project: ModrinthProject) => setWorld(project),
        update,
        askUninstall: setRemoving,
        dialogs,
    };
};

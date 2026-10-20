import React, { useRef } from 'react';
import axios from 'axios';
import { DownloadIcon, SwitchHorizontalIcon, UploadIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import { useStoreState } from '@/state/hooks';
import http from '@/api/http';
import loadDirectory from '@/api/server/files/loadDirectory';
import compressFiles from '@/api/server/files/compressFiles';
import decompressFiles from '@/api/server/files/decompressFiles';
import deleteFiles from '@/api/server/files/deleteFiles';
import renameFiles from '@/api/server/files/renameFiles';
import saveFileContents from '@/api/server/files/saveFileContents';
import getFileDownloadUrl from '@/api/server/files/getFileDownloadUrl';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl';
import { bytesToString } from '@/lib/formatters';
import { runTask } from '@/lib/tasks';
import { Button } from '@/components/elements/button/index';
import SectionCard from '@/components/elements/SectionCard';

const MANIFEST = 'stratserver.json';
const SUFFIX = '.stratserver.tar.gz';

const slug = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'server';

/** Download a string as a file. */
const saveText = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/**
 * Moving a server to another panel: one file with its settings and its files (the settings are the file stratserver.json inside the
 * archive), and the other way round, putting the files of such a file on this server.
 */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const name = ServerContext.useStoreState((state) => state.server.data!.name);
    const isOwner = ServerContext.useStoreState((state) => state.server.data!.isOwner);
    const installing = ServerContext.useStoreState((state) => state.server.data!.status === 'installing');
    const admin = useStoreState((state) => state.user.data!.rootAdmin);
    const input = useRef<HTMLInputElement>(null);

    const exportServer = (withFiles: boolean) => {
        return runTask('archive', `Exporting ${name}`, async (report) => {
            report('Reading the settings...');
            const { data } = await http.get(`/api/client/servers/${uuid}/settings/export`);
            const text = JSON.stringify(data, null, 2);

            if (!withFiles) {
                saveText(`${slug(name)}.stratserver.json`, text);
                report('Settings only');
                return;
            }

            await saveFileContents(uuid, `/${MANIFEST}`, text);
            try {
                const top = (await loadDirectory(uuid, '/'))
                    .map((file) => file.name)
                    .filter((n) => !n.endsWith(SUFFIX));

                report('Compressing the files...');
                const archive = await compressFiles(uuid, '/', top, true);
                const finalName = `${slug(name)}${SUFFIX}`;
                await deleteFiles(uuid, '/', [finalName], { permanent: true }).catch(() => undefined);
                await renameFiles(uuid, '/', [{ from: archive.name, to: finalName }]);

                report(`${finalName} (${bytesToString(archive.size)}), it stays in the files of this server`);
                window.location.href = await getFileDownloadUrl(uuid, `/${finalName}`);
            } finally {
                await deleteFiles(uuid, '/', [MANIFEST], { permanent: true }).catch(() => undefined);
            }
        });
    };

    const importFiles = (file: File) => {
        return runTask('extract', `Importing the files of ${file.name}`, async (report) => {
            const url = await getFileUploadUrl(uuid);
            await axios.post(
                url,
                { files: file },
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    params: { directory: '/' },
                    onUploadProgress: (e) => report('Uploading...', { done: e.loaded, total: e.total || file.size }),
                }
            );

            report('Extracting...');
            await decompressFiles(uuid, '/', file.name, true);
            await deleteFiles(uuid, '/', [file.name, MANIFEST], { permanent: true }).catch(() => undefined);
            report('Done');
        });
    };

    if (!isOwner && !admin) return null;

    return (
        <SectionCard
            className={'mb-6 md:mb-10'}
            icon={<SwitchHorizontalIcon className={'h-5 w-5'} />}
            title={'Move to another panel'}
            description={'Export this server to one file, or put the files of such a file on this server.'}
        >
            <input
                ref={input}
                type={'file'}
                accept={'.tar.gz,.tgz'}
                className={'hidden'}
                onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (file) importFiles(file);
                }}
            />
            <p className={'mb-4 text-sm text-neutral-300'}>
                The export holds the settings, egg, variables and schedules, and all the files. On the other panel
                choose it under <em>Create Server &rsaquo; Import a Server</em>, then wait until the new server has
                installed and import the files here.
            </p>
            <div className={'flex flex-wrap gap-3'}>
                <Button onClick={() => exportServer(true)}>
                    <DownloadIcon className={'mr-2 h-4 w-4'} />
                    Export with files
                </Button>
                <Button.Text onClick={() => exportServer(false)}>Settings only</Button.Text>
                <Button.Text
                    disabled={installing}
                    title={installing ? 'Wait until the server has installed' : 'Replaces files with the same name'}
                    onClick={() => input.current?.click()}
                >
                    <UploadIcon className={'mr-2 h-4 w-4'} />
                    Import files from an export
                </Button.Text>
            </div>
        </SectionCard>
    );
};

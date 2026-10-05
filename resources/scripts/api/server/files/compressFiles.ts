import { FileObject } from '@/api/server/files/loadDirectory';
import http from '@/api/http';
import archiveTask from '@/api/server/files/archiveTask';

export default async (uuid: string, directory: string, files: string[], background = false): Promise<FileObject> => {
    const { data } = await http.post(
        `/api/client/servers/${uuid}/files/compress`,
        { root: directory, files },
        background ? { headers: { 'X-Panel-Background': '1' } } : {}
    );

    return (await archiveTask(uuid, data)) as FileObject;
};

import http from '@/api/http';
import archiveTask from '@/api/server/files/archiveTask';

export default async (uuid: string, directory: string, file: string, background = false): Promise<void> => {
    const { data } = await http.post(
        `/api/client/servers/${uuid}/files/decompress`,
        { root: directory, file },
        background ? { headers: { 'X-Panel-Background': '1' } } : {}
    );

    await archiveTask(uuid, data);
};

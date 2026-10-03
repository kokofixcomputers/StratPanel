import { FileObject } from '@/api/server/files/loadDirectory';
import http from '@/api/http';
import { rawDataToFileObject } from '@/api/transformers';

export default async (uuid: string, directory: string, files: string[], background = false): Promise<FileObject> => {
    const { data } = await http.post(
        `/api/client/servers/${uuid}/files/compress`,
        { root: directory, files },
        background
            ? // Background tasks may run for as long as Wings needs, and must not drive the top loading bar.
              { timeout: 0, headers: { 'X-Panel-Background': '1' } }
            : {
                  timeout: 60000,
                  timeoutErrorMessage:
                      'It looks like this archive is taking a long time to generate. It will appear once completed.',
              }
    );

    return rawDataToFileObject(data);
};

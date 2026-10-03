import http from '@/api/http';

export default async (uuid: string, directory: string, file: string, background = false): Promise<void> => {
    await http.post(
        `/api/client/servers/${uuid}/files/decompress`,
        { root: directory, file },
        background
            ? { timeout: 0, headers: { 'X-Panel-Background': '1' } }
            : {
                  timeout: 300000,
                  timeoutErrorMessage:
                      'It looks like this archive is taking a long time to be unarchived. Once completed the unarchived files will appear.',
              }
    );
};

import http from '@/api/http';

export default async (uuid: string, url: string, directory: string, filename?: string): Promise<void> => {
    await http.post(
        `/api/client/servers/${uuid}/files/pull`,
        { url, directory, filename, use_header: false, foreground: true },
        // Large server archives can take a while to download, so don't use the default request timeout.
        { timeout: 0 }
    );
};

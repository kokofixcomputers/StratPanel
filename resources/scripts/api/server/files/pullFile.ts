import http from '@/api/http';

export default async (uuid: string, url: string, directory: string, filename?: string): Promise<void> => {
    try {
        await http.post(
            `/api/client/servers/${uuid}/files/pull`,
            { url, directory, filename, use_header: false, foreground: true },
            // Large server archives can take a while to download, so don't use the default request timeout.
            { timeout: 0 }
        );
    } catch (error) {
        // The panel limits how many downloads a server may start, say how long it takes to be able to again.
        if ((error as any)?.response?.status === 429) {
            const wait = parseInt((error as any).response.headers?.['retry-after'] || '', 10);

            throw new Error(
                `This server started too many downloads in a short time.${
                    wait > 0
                        ? ` Try again in ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`}.`
                        : ' Try again in a minute or two.'
                }`
            );
        }

        throw error;
    }
};

import http from '@/api/http';

/**
 * Deletes files. With the trash bin on they are moved to it, so they can be recovered. `permanent` is for the housekeeping of the panel
 * (temporary folders and files it made itself), which only has an effect for people who may delete from the trash bin too.
 */
export default (
    uuid: string,
    directory: string,
    files: string[],
    options: { permanent?: boolean } = {}
): Promise<void> => {
    return new Promise((resolve, reject) => {
        http.post(`/api/client/servers/${uuid}/files/delete`, {
            root: directory,
            files,
            ...(options.permanent ? { skip_trash: true } : {}),
        })
            .then(() => resolve())
            .catch(reject);
    });
};

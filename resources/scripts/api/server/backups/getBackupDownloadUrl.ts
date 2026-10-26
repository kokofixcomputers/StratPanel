import http from '@/api/http';

// A copy outside the node is asked for by the id of its destination, without it the file on the node (or a copy, when it is not there).
export default (uuid: string, backup: string, copy?: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        http.get(`/api/client/servers/${uuid}/backups/${backup}/download`, {
            params: copy === undefined ? {} : { copy },
        })
            .then(({ data }) => resolve(data.attributes.url))
            .catch(reject);
    });
};

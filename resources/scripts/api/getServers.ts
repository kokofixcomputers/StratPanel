import { rawDataToServerObject, Server } from '@/api/server/getServer';
import http, { getPaginationSet, PaginatedResult } from '@/api/http';

interface QueryParams {
    query?: string;
    page?: number;
    // The most the panel gives at once is 100.
    per_page?: number;
    type?: string;
}

const getServers = ({ query, ...params }: QueryParams): Promise<PaginatedResult<Server>> => {
    return new Promise((resolve, reject) => {
        http.get('/api/client', {
            params: {
                'filter[*]': query,
                ...params,
            },
        })
            .then(({ data }) =>
                resolve({
                    items: (data.data || []).map((datum: any) => rawDataToServerObject(datum)),
                    pagination: getPaginationSet(data.meta.pagination),
                })
            )
            .catch(reject);
    });
};

export default getServers;

/** All the servers of the person, page after page (a person with more than a thousand gets the first thousand). */
export const getAllServers = async (): Promise<Server[]> => {
    const all: Server[] = [];
    for (let page = 1; page <= 10; page++) {
        const result = await getServers({ page, per_page: 100 });
        all.push(...result.items);
        if (result.pagination.currentPage >= result.pagination.totalPages) break;
    }

    return all;
};

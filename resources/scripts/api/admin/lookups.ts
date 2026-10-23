import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';
import { ChoiceGroup } from '@/components/admin/forms';

export interface LocationWithNodes {
    id: number;
    short: string;
    nodes: { id: number; name: string }[];
}

/** The nodes of every location, for the lists that ask which node something is for. */
export const useNodeLookup = () =>
    useSWR<LocationWithNodes[], AxiosError>(
        'admin:lookups:nodes',
        async () => (await http.get('/api/client/admin/lookups/nodes')).data.locations,
        { revalidateOnFocus: false }
    );

/** The nodes as the groups of a select, one group for each location. */
export const nodeGroups = (locations: LocationWithNodes[] | undefined): ChoiceGroup[] =>
    (locations || [])
        .filter((location) => location.nodes.length > 0)
        .map((location) => ({
            label: location.short,
            choices: location.nodes.map((node) => ({ value: String(node.id), label: node.name })),
        }));

export interface NestWithEggs {
    id: number;
    name: string;
    eggs: { id: number; name: string }[];
}

/** The eggs of every nest, for the lists that ask which egg something is for. */
export const useEggLookup = () =>
    useSWR<NestWithEggs[], AxiosError>(
        'admin:lookups:eggs',
        async () => (await http.get('/api/client/admin/lookups/eggs')).data.nests,
        { revalidateOnFocus: false }
    );

import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';

export interface LocationRow {
    id: number;
    short: string;
    long: string | null;
    nodes: number;
    servers: number;
}

export interface LocationDetails {
    id: number;
    short: string;
    long: string | null;
    nodes: { id: number; name: string; fqdn: string; servers: number }[];
}

export interface LocationInput {
    short: string;
    long: string;
}

export const useLocations = () =>
    useSWR<{ locations: LocationRow[] }, AxiosError>(
        'admin:locations',
        async () => (await http.get('/api/client/admin/locations')).data,
        { revalidateOnFocus: false }
    );

export const useLocation = (id: string | undefined) =>
    useSWR<LocationDetails, AxiosError>(
        id ? `admin:locations:${id}` : null,
        async () => (await http.get(`/api/client/admin/locations/${id}`)).data,
        { revalidateOnFocus: false }
    );

export const createLocation = async (input: LocationInput): Promise<{ id: number }> =>
    (await http.post('/api/client/admin/locations', input)).data;

export const updateLocation = (id: number, input: LocationInput) =>
    http.patch(`/api/client/admin/locations/${id}`, input);

export const deleteLocation = (id: number) => http.delete(`/api/client/admin/locations/${id}`);

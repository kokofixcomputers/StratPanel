import http from '@/api/http';

export interface CustomVariable {
    key: string;
    value: string;
}

export const getEnvironment = async (uuid: string): Promise<{ variables: CustomVariable[]; max: number }> => {
    const { data } = await http.get(`/api/client/servers/${uuid}/startup/environment`);

    return { variables: data.data || [], max: data.meta?.max ?? 50 };
};

export const setEnvironment = async (uuid: string, key: string, value: string): Promise<CustomVariable> => {
    const { data } = await http.post(`/api/client/servers/${uuid}/startup/environment`, { key, value });

    return data;
};

export const deleteEnvironment = async (uuid: string, key: string): Promise<void> => {
    await http.delete(`/api/client/servers/${uuid}/startup/environment/${encodeURIComponent(key)}`);
};

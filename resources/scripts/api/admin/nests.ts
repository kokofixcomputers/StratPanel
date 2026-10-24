import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';

export interface NestRow {
    id: number;
    name: string;
    author: string;
    description: string | null;
    eggs: number;
    servers: number;
}

export interface Nest {
    id: number;
    uuid: string;
    name: string;
    author: string;
    description: string | null;
    servers: number;
    eggs: { id: number; name: string; author: string; description: string | null; servers: number }[];
}

export interface NestLookup {
    id: number;
    name: string;
    author: string;
    eggs: { id: number; name: string; author: string }[];
}

export interface Egg {
    id: number;
    uuid: string;
    author: string;
    name: string;
    description: string | null;
    nest: { id: number; name: string };
    siblings: { id: number; name: string; author: string }[];
    docker_images: string;
    force_outgoing_ip: boolean;
    startup: string;
    features: string[];
    config_from: number | null;
    config_stop: string;
    config_logs: string;
    config_files: string;
    config_startup: string;
}

export interface EggInput {
    nest_id?: number;
    name: string;
    description: string;
    docker_images: string;
    force_outgoing_ip: boolean;
    startup: string;
    features: string[];
    config_from: string;
    config_stop: string;
    config_logs: string;
    config_files: string;
    config_startup: string;
}

export interface EggVariable {
    id: number;
    name: string;
    description: string;
    env_variable: string;
    default_value: string;
    user_viewable: boolean;
    user_editable: boolean;
    rules: string;
}

export interface VariableInput {
    name: string;
    description: string;
    env_variable: string;
    default_value: string;
    options: string[];
    rules: string;
}

export interface EggScript {
    id: number;
    name: string;
    nest: { id: number; name: string };
    script_install: string;
    script_container: string;
    script_entry: string;
    script_is_privileged: boolean;
    copy_script_from: number | null;
    copying_from: { id: number; name: string } | null;
    copy_options: { id: number; name: string }[];
    relied_on_by: { id: number; name: string }[];
}

const base = '/api/client/admin';

export const useNests = () =>
    useSWR<{ nests: NestRow[] }, AxiosError>('admin:nests', async () => (await http.get(`${base}/nests`)).data, {
        revalidateOnFocus: false,
    });

export const useNest = (id: string) =>
    useSWR<Nest, AxiosError>(`admin:nests:${id}`, async () => (await http.get(`${base}/nests/${id}`)).data, {
        revalidateOnFocus: false,
    });

export const useNestLookup = () =>
    useSWR<{ nests: NestLookup[] }, AxiosError>(
        'admin:nests:lookup',
        async () => (await http.get(`${base}/nests/lookup`)).data,
        { revalidateOnFocus: false }
    );

export const createNest = async (input: { name: string; description: string }): Promise<Nest> =>
    (await http.post(`${base}/nests`, input)).data;

export const updateNest = async (id: number, input: { name: string; description: string }): Promise<Nest> =>
    (await http.patch(`${base}/nests/${id}`, input)).data;

export const deleteNest = async (id: number): Promise<void> => {
    await http.delete(`${base}/nests/${id}`);
};

export const useEgg = (id: string | undefined) =>
    useSWR<Egg, AxiosError>(id ? `admin:eggs:${id}` : null, async () => (await http.get(`${base}/eggs/${id}`)).data, {
        revalidateOnFocus: false,
    });

const eggBody = (input: EggInput) => ({
    ...input,
    // A text box that was left empty is "none", not the number zero.
    config_from: input.config_from === '' ? null : input.config_from,
});

export const createEgg = async (input: EggInput): Promise<Egg> =>
    (await http.post(`${base}/eggs`, eggBody(input))).data;

export const updateEgg = async (id: number, input: EggInput): Promise<Egg> =>
    (await http.patch(`${base}/eggs/${id}`, eggBody(input))).data;

export const deleteEgg = async (id: number): Promise<{ nest_id: number }> =>
    (await http.delete(`${base}/eggs/${id}`)).data;

const file = (name: string, value: File, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.append(name, value);
    Object.entries(extra).forEach(([key, v]) => form.append(key, v));

    return form;
};

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export const importEgg = async (nestId: number, upload: File): Promise<{ id: number }> =>
    (await http.post(`${base}/eggs/import`, file('import_file', upload, { import_to_nest: String(nestId) }), multipart))
        .data;

export const updateEggFromFile = async (id: number, upload: File): Promise<Egg> =>
    (await http.post(`${base}/eggs/${id}/import`, file('import_file', upload), multipart)).data;

export const useEggVariables = (id: string) =>
    useSWR<{ id: number; name: string; nest: { id: number; name: string }; variables: EggVariable[] }, AxiosError>(
        `admin:eggs:${id}:variables`,
        async () => (await http.get(`${base}/eggs/${id}/variables`)).data,
        { revalidateOnFocus: false }
    );

// Nothing ticked is no "options" at all: the server asks for at least one when the field is there.
const variableBody = ({ options, ...rest }: VariableInput) => (options.length > 0 ? { ...rest, options } : rest);

export const createVariable = async (egg: number, input: VariableInput): Promise<void> => {
    await http.post(`${base}/eggs/${egg}/variables`, variableBody(input));
};

export const updateVariable = async (egg: number, id: number, input: VariableInput): Promise<void> => {
    await http.patch(`${base}/eggs/${egg}/variables/${id}`, variableBody(input));
};

export const deleteVariable = async (egg: number, id: number): Promise<void> => {
    await http.delete(`${base}/eggs/${egg}/variables/${id}`);
};

export const useEggScript = (id: string) =>
    useSWR<EggScript, AxiosError>(
        `admin:eggs:${id}:script`,
        async () => (await http.get(`${base}/eggs/${id}/script`)).data,
        {
            revalidateOnFocus: false,
        }
    );

export const updateEggScript = async (
    id: number,
    input: Pick<EggScript, 'script_install' | 'script_container' | 'script_entry'> & { copy_script_from: string }
): Promise<EggScript> =>
    (await http.patch(`${base}/eggs/${id}/script`, { ...input, copy_script_from: input.copy_script_from || null }))
        .data;

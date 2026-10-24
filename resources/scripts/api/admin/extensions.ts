import useSWR from 'swr';
import { AxiosError } from 'axios';
import http from '@/api/http';

export interface ExtensionRow {
    id: string;
    name: string;
    version: string;
    author: string | null;
    description: string | null;
    broken: boolean;
    enabled: boolean;
    running: boolean;
    failed: boolean;
    last_error: string | null;
    last_error_at: string | null;
    has_settings: boolean;
}

export interface ExtensionSetting {
    key: string;
    type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'password';
    label: string;
    help?: string;
    placeholder?: string;
    rows?: number;
    min?: number;
    max?: number;
    options: Record<string, string> | null;
    saved: boolean | null;
}

export interface ExtensionSettingsData {
    id: string;
    name: string;
    version: string;
    author: string | null;
    homepage: string | null;
    enabled: boolean;
    settings: ExtensionSetting[];
    values: Record<string, string | number | boolean>;
}

export const useExtensions = () =>
    useSWR<{ safe_mode: boolean; extensions: ExtensionRow[] }, AxiosError>(
        'admin:extensions',
        async () => (await http.get('/api/client/admin/extensions')).data,
        { revalidateOnFocus: false }
    );

export const useExtensionSettings = (id: string) =>
    useSWR<ExtensionSettingsData, AxiosError>(
        `admin:extensions:${id}`,
        async () => (await http.get(`/api/client/admin/extensions/${id}/settings`)).data,
        { revalidateOnFocus: false }
    );

export const toggleExtension = async (id: string): Promise<void> => {
    await http.post(`/api/client/admin/extensions/${id}/toggle`);
};

export const clearExtensionError = async (id: string): Promise<void> => {
    await http.post(`/api/client/admin/extensions/${id}/clear-error`);
};

export const saveExtensionSettings = async (id: string, settings: Record<string, unknown>): Promise<void> => {
    await http.patch(`/api/client/admin/extensions/${id}/settings`, { settings });
};

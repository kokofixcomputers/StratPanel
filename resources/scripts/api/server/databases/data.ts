import useSWR from 'swr';
import { AxiosError } from 'axios';
import http, { getPaginationSet, PaginationDataSet } from '@/api/http';

export interface DatabaseSize {
    bytes: number;
    tables: number;
}

export interface TableInfo {
    name: string;
    rows: number;
    bytes: number;
    engine: string | null;
}

export interface ColumnInfo {
    name: string;
    type: string;
    data_type: string;
    nullable: boolean;
    key: string;
    extra: string;
    default: string | null;
    binary: boolean;
    generated: boolean;
}

// A cell: text, nothing (NULL), a binary column (only its length) or text too long to show whole.
export type Cell = string | null | { binary: number } | { cut: string; length: number };

export interface TableRows {
    table: string;
    columns: ColumnInfo[];
    primary: string[];
    editable: boolean;
    rows: Record<string, Cell>[];
    pagination: PaginationDataSet;
}

const base = (uuid: string) => `/api/client/servers/${uuid}/databases`;

/** How big each database of the server is (a host that does not answer is left out). */
export const useDatabaseSizes = (uuid: string, enabled = true) =>
    useSWR<Record<string, DatabaseSize>, AxiosError>(
        enabled ? ['server:database-sizes', uuid] : null,
        async () => (await http.get(`${base(uuid)}/sizes`)).data.sizes,
        { revalidateOnFocus: false }
    );

export const useTables = (uuid: string, database: string) =>
    useSWR<{ tables: TableInfo[]; bytes: number }, AxiosError>(
        ['server:database-tables', uuid, database],
        async () => (await http.get(`${base(uuid)}/${database}/tables`)).data,
        { revalidateOnFocus: false }
    );

export const getRows = async (
    uuid: string,
    database: string,
    table: string,
    page: number,
    sort: string | null,
    direction: 'asc' | 'desc'
): Promise<TableRows> => {
    const { data } = await http.get(`${base(uuid)}/${database}/tables/${encodeURIComponent(table)}`, {
        params: { page, per_page: 25, sort: sort || undefined, direction },
    });

    return { ...data, pagination: getPaginationSet(data.pagination) };
};

export const insertRow = async (
    uuid: string,
    database: string,
    table: string,
    values: Record<string, string | null>
) => {
    await http.post(`${base(uuid)}/${database}/tables/${encodeURIComponent(table)}`, { values });
};

export const updateRow = async (
    uuid: string,
    database: string,
    table: string,
    key: Record<string, string>,
    values: Record<string, string | null>
) => {
    await http.patch(`${base(uuid)}/${database}/tables/${encodeURIComponent(table)}`, { key, values });
};

export const deleteRow = async (uuid: string, database: string, table: string, key: Record<string, string>) => {
    await http.delete(`${base(uuid)}/${database}/tables/${encodeURIComponent(table)}`, { data: { key } });
};

export const sizeText = (bytes: number): string =>
    bytes >= 1073741824
        ? `${(bytes / 1073741824).toFixed(2)} GB`
        : bytes >= 1048576
        ? `${(bytes / 1048576).toFixed(1)} MB`
        : bytes >= 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${bytes} B`;

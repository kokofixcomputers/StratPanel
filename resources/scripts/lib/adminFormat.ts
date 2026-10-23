/** How the admin pages say numbers. Memory and disk are stored in MiB. */
export const sizeMiB = (mib: number): string =>
    mib >= 1024 ? `${(Math.round((mib / 1024) * 10) / 10).toString()} GiB` : `${mib} MiB`;

export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

/** The colour of a bar of a limit: plenty of room, getting full, or over. */
export type Level = 'ok' | 'warning' | 'danger';

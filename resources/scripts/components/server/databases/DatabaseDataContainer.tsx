import React, { useCallback, useEffect, useState } from 'react';
import classNames from 'classnames';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeftIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    DatabaseIcon,
    KeyIcon,
    PencilIcon,
    PlusIcon,
    TableIcon,
    TrashIcon,
} from '@heroicons/react/solid';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader from '@/components/elements/PageHeader';
import SectionCard from '@/components/elements/SectionCard';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Can from '@/components/elements/Can';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Input, { Textarea } from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import PaginationFooter from '@/components/elements/table/PaginationFooter';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';
import { ServerContext } from '@/state/server';
import getServerDatabases from '@/api/server/databases/getServerDatabases';
import {
    Cell,
    ColumnInfo,
    deleteRow,
    getRows,
    insertRow,
    sizeText,
    TableRows,
    updateRow,
    useTables,
} from '@/api/server/databases/data';

const show = (cell: Cell | undefined): React.ReactNode => {
    if (cell === null || cell === undefined) return <span className={'italic text-neutral-400'}>NULL</span>;
    if (typeof cell === 'string') return cell === '' ? <span className={'italic text-neutral-400'}>empty</span> : cell;
    if ('binary' in cell) return <span className={'text-neutral-400'}>[binary, {sizeText(cell.binary)}]</span>;

    return (
        <span title={`${cell.length} characters`}>
            {cell.cut}
            <span className={'text-neutral-400'}>… ({cell.length})</span>
        </span>
    );
};

const keyOf = (data: TableRows, row: Record<string, Cell>): Record<string, string> =>
    Object.fromEntries(data.primary.map((name) => [name, String(row[name])]));

/** One row to add or change: a field for each column that can be written, and only what was changed is sent. */
const RowEditor = ({
    columns,
    row,
    onClose,
    onSave,
}: {
    columns: ColumnInfo[];
    row: Record<string, Cell> | null;
    onClose: () => void;
    onSave: (values: Record<string, string | null>) => Promise<void>;
}) => {
    const initial = (c: ColumnInfo): { text: string; isNull: boolean } => {
        const cell = row?.[c.name];
        if (!row) return { text: '', isNull: false };
        if (cell === null || cell === undefined) return { text: '', isNull: true };

        return { text: typeof cell === 'string' ? cell : '', isNull: false };
    };
    const [state, setState] = useState<Record<string, { text: string; isNull: boolean; touched: boolean }>>(() =>
        Object.fromEntries(columns.map((c) => [c.name, { ...initial(c), touched: false }]))
    );
    const [busy, setBusy] = useState(false);

    const set = (name: string, changes: Partial<{ text: string; isNull: boolean }>) =>
        setState({ ...state, [name]: { ...state[name], ...changes, touched: true } });

    const save = () => {
        const values: Record<string, string | null> = {};
        columns.forEach((c) => {
            const s = state[c.name];
            if (!s.touched || c.binary || c.generated) return;
            values[c.name] = s.isNull ? null : s.text;
        });
        setBusy(true);
        onSave(values)
            .then(onClose)
            .catch(() => setBusy(false));
    };

    return (
        <Dialog open onClose={onClose} title={row ? 'Edit row' : 'Add a row'}>
            <div className={'max-h-[60vh] space-y-4 overflow-y-auto pr-1'}>
                {columns.map((c) => {
                    const cell = row?.[c.name];
                    const locked =
                        c.binary ||
                        c.generated ||
                        (!!cell && typeof cell === 'object' && 'cut' in cell) ||
                        (!!row && c.key === 'PRI');
                    const s = state[c.name];
                    const long = c.data_type.includes('text') || c.data_type === 'json';

                    return (
                        <div key={c.name}>
                            <Label htmlFor={`col-${c.name}`}>
                                {c.key === 'PRI' && (
                                    <KeyIcon className={'-mt-0.5 mr-1 inline h-3.5 w-3.5 text-yellow-500'} />
                                )}
                                {c.name} <span className={'font-normal text-neutral-400'}>{c.type}</span>
                            </Label>
                            {locked ? (
                                <p
                                    className={
                                        'rounded border border-neutral-500 bg-neutral-600 px-3 py-2 text-sm text-neutral-300'
                                    }
                                >
                                    {c.binary
                                        ? 'Binary data can not be edited here.'
                                        : c.generated
                                        ? 'Made by the database.'
                                        : c.key === 'PRI' && row
                                        ? show(cell)
                                        : 'Too long to edit here, it stays as it is.'}
                                </p>
                            ) : long ? (
                                <Textarea
                                    id={`col-${c.name}`}
                                    rows={4}
                                    value={s.text}
                                    disabled={s.isNull}
                                    placeholder={!row && c.default !== null ? `Default: ${c.default}` : undefined}
                                    onChange={(e) => set(c.name, { text: e.currentTarget.value, isNull: false })}
                                />
                            ) : (
                                <Input
                                    id={`col-${c.name}`}
                                    value={s.text}
                                    disabled={s.isNull}
                                    placeholder={
                                        !row && c.extra.includes('auto_increment')
                                            ? 'Made by the database'
                                            : !row && c.default !== null
                                            ? `Default: ${c.default}`
                                            : undefined
                                    }
                                    onChange={(e) => set(c.name, { text: e.currentTarget.value, isNull: false })}
                                />
                            )}
                            {!locked && c.nullable && (
                                <label className={'mt-1 flex items-center gap-2 text-xs text-neutral-300'}>
                                    <Input
                                        type={'checkbox'}
                                        checked={s.isNull}
                                        onChange={(e) => set(c.name, { isNull: e.currentTarget.checked })}
                                    />
                                    NULL
                                </label>
                            )}
                        </div>
                    );
                })}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button onClick={save} disabled={busy}>
                    {row ? 'Save row' : 'Add row'}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
};

/** Server > Databases > one database: its size, its tables and their rows, which can be changed. */
export default () => {
    const { databaseId } = useParams<{ databaseId: string }>();
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverId = ServerContext.useStoreState((state) => state.server.data!.id);
    const stored = ServerContext.useStoreState((state) => state.databases.data);
    const { data: overview, error: overviewError, mutate } = useTables(uuid, databaseId);
    const { addFlash, clearFlashes, addError } = useFlash();
    const [name, setName] = useState(stored.find((d) => d.id === databaseId)?.name ?? '');
    const [table, setTable] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
    const [data, setData] = useState<TableRows | null>(null);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<{ row: Record<string, Cell> | null } | null>(null);
    const [removing, setRemoving] = useState<Record<string, Cell> | null>(null);

    useEffect(() => {
        if (name) return;
        getServerDatabases(uuid, false)
            .then((list) => setName(list.find((d) => d.id === databaseId)?.name ?? ''))
            .catch(() => undefined);
    }, []);

    useEffect(() => {
        if (overview && !table) setTable(overview.tables[0]?.name ?? null);
    }, [overview]);

    useEffect(() => {
        if (overviewError) addError({ key: 'database:data', message: httpErrorToHuman(overviewError) });
    }, [overviewError]);

    const load = useCallback(() => {
        if (!table) return;
        setLoading(true);
        getRows(uuid, databaseId, table, page, sort?.column ?? null, sort?.direction ?? 'asc')
            .then(setData)
            .catch((e) => addError({ key: 'database:data', message: httpErrorToHuman(e) }))
            .then(() => setLoading(false));
    }, [uuid, databaseId, table, page, sort]);

    useEffect(load, [load]);

    const flash = (work: Promise<unknown>, message: string): Promise<void> => {
        clearFlashes('database:data');

        return work
            .then(() => {
                addFlash({ key: 'database:data', type: 'success', message });
                load();
                mutate();
            })
            .catch((e) => {
                addError({ key: 'database:data', message: httpErrorToHuman(e) });
                throw e;
            });
    };

    const choose = (next: string) => {
        setTable(next);
        setPage(1);
        setSort(null);
        setData(null);
    };

    return (
        <ServerContentBlock title={`${name || 'Database'} - Databases`}>
            <PageHeader
                title={name || 'Database'}
                subtitle={
                    overview
                        ? `${overview.tables.length} ${overview.tables.length === 1 ? 'table' : 'tables'}, ${sizeText(
                              overview.bytes
                          )}`
                        : 'Look at the data of this database and change it.'
                }
            />
            <div className={'mb-4'}>
                <Link to={`/server/${serverId}/databases`} className={'inline-flex items-center text-sm'}>
                    <ArrowLeftIcon className={'mr-1 h-4 w-4'} />
                    Databases
                </Link>
            </div>
            <FlashMessageRender byKey={'database:data'} className={'mb-4'} />
            {!overview ? (
                overviewError ? null : (
                    <Spinner size={'large'} centered />
                )
            ) : overview.tables.length === 0 ? (
                <p
                    className={
                        'rounded-xl border border-neutral-500 bg-white p-8 text-center text-sm text-neutral-400 shadow-md'
                    }
                >
                    This database has no tables yet.
                </p>
            ) : (
                <div className={'grid gap-4 lg:grid-cols-4'}>
                    <SectionCard
                        icon={<DatabaseIcon className={'h-5 w-5'} />}
                        title={'Tables'}
                        className={'lg:col-span-1'}
                    >
                        <ul className={'-mx-2 space-y-1'}>
                            {overview.tables.map((t) => (
                                <li key={t.name}>
                                    <button
                                        type={'button'}
                                        onClick={() => choose(t.name)}
                                        className={classNames(
                                            'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                                            t.name === table
                                                ? 'bg-primary-50 font-medium text-primary-700'
                                                : 'text-neutral-200 hover:bg-neutral-600'
                                        )}
                                    >
                                        <TableIcon className={'h-4 w-4 flex-shrink-0'} />
                                        <span className={'min-w-0 flex-1 truncate font-mono text-xs'}>{t.name}</span>
                                        <span className={'text-2xs text-neutral-400'}>{sizeText(t.bytes)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </SectionCard>
                    <SectionCard
                        className={'lg:col-span-3'}
                        icon={<TableIcon className={'h-5 w-5'} />}
                        title={table ?? ''}
                        badge={
                            data?.editable && (
                                <Can action={'database.update'}>
                                    <Button.Text onClick={() => setEditing({ row: null })}>
                                        <PlusIcon className={'-ml-1 mr-1 h-4 w-4'} />
                                        Add row
                                    </Button.Text>
                                </Can>
                            )
                        }
                    >
                        {!data ? (
                            <Spinner centered />
                        ) : (
                            <>
                                {!data.editable && (
                                    <p className={'mb-3 text-xs text-neutral-400'}>
                                        This table has no primary key, so a row can not be told from another: it can
                                        only be looked at.
                                    </p>
                                )}
                                <div className={classNames('overflow-x-auto', loading && 'opacity-60')}>
                                    <table className={'w-full text-sm'}>
                                        <thead>
                                            <tr
                                                className={
                                                    'text-left text-2xs uppercase tracking-wide text-neutral-400'
                                                }
                                            >
                                                {data.editable && <th className={'w-16 px-3 py-2'} />}
                                                {data.columns.map((c) => (
                                                    <th
                                                        key={c.name}
                                                        className={'whitespace-nowrap px-3 py-2 font-medium'}
                                                    >
                                                        <button
                                                            type={'button'}
                                                            disabled={c.binary}
                                                            className={'inline-flex items-center gap-1 uppercase'}
                                                            onClick={() => {
                                                                setPage(1);
                                                                setSort(
                                                                    sort?.column === c.name && sort.direction === 'asc'
                                                                        ? { column: c.name, direction: 'desc' }
                                                                        : { column: c.name, direction: 'asc' }
                                                                );
                                                            }}
                                                            title={c.type}
                                                        >
                                                            {c.key === 'PRI' && (
                                                                <KeyIcon className={'h-3 w-3 text-yellow-500'} />
                                                            )}
                                                            {c.name}
                                                            {sort?.column === c.name &&
                                                                (sort.direction === 'asc' ? (
                                                                    <ChevronUpIcon className={'h-3 w-3'} />
                                                                ) : (
                                                                    <ChevronDownIcon className={'h-3 w-3'} />
                                                                ))}
                                                        </button>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.rows.length === 0 && (
                                                <tr>
                                                    <td
                                                        colSpan={data.columns.length + 1}
                                                        className={'px-3 py-8 text-center text-neutral-400'}
                                                    >
                                                        This table has no rows.
                                                    </td>
                                                </tr>
                                            )}
                                            {data.rows.map((row, i) => (
                                                <tr key={i} className={'border-t border-neutral-500 align-top'}>
                                                    {data.editable && (
                                                        <td className={'whitespace-nowrap px-3 py-2'}>
                                                            <Can action={'database.update'}>
                                                                <button
                                                                    type={'button'}
                                                                    title={'Edit'}
                                                                    className={'mr-2 text-primary-600'}
                                                                    onClick={() => setEditing({ row })}
                                                                >
                                                                    <PencilIcon className={'h-4 w-4'} />
                                                                </button>
                                                                <button
                                                                    type={'button'}
                                                                    title={'Delete'}
                                                                    className={'text-red-500'}
                                                                    onClick={() => setRemoving(row)}
                                                                >
                                                                    <TrashIcon className={'h-4 w-4'} />
                                                                </button>
                                                            </Can>
                                                        </td>
                                                    )}
                                                    {data.columns.map((c) => (
                                                        <td
                                                            key={c.name}
                                                            className={
                                                                'max-w-xs break-words px-3 py-2 font-mono text-xs text-neutral-100'
                                                            }
                                                        >
                                                            {show(row[c.name])}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <PaginationFooter
                                    pagination={data.pagination}
                                    onPageSelect={setPage}
                                    className={'mt-3'}
                                />
                            </>
                        )}
                    </SectionCard>
                </div>
            )}

            {editing && data && table && (
                <RowEditor
                    columns={data.columns}
                    row={editing.row}
                    onClose={() => setEditing(null)}
                    onSave={(values) =>
                        editing.row
                            ? flash(
                                  updateRow(uuid, databaseId, table, keyOf(data, editing.row), values),
                                  'The row was saved.'
                              )
                            : flash(insertRow(uuid, databaseId, table, values), 'The row was added.')
                    }
                />
            )}
            <Dialog.Confirm
                open={!!removing}
                title={'Delete this row?'}
                confirm={'Delete'}
                onConfirmed={() => {
                    if (!removing || !data || !table) return;
                    flash(deleteRow(uuid, databaseId, table, keyOf(data, removing)), 'The row was deleted.').catch(
                        () => undefined
                    );
                    setRemoving(null);
                }}
                onClose={() => setRemoving(null)}
            >
                It can not be brought back.
            </Dialog.Confirm>
        </ServerContentBlock>
    );
};

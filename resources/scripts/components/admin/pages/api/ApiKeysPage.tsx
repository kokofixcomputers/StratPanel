import React, { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { KeyIcon, PlusIcon, TrashIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { AdminTable, Cell, Empty, Row } from '@/components/admin/AdminTable';
import { ListHeader } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import Spinner from '@/components/elements/Spinner';
import Sensitive from '@/components/elements/Sensitive';
import useFlash from '@/plugins/useFlash';
import { ApplicationKey, deleteApplicationKey, useApplicationKeys } from '@/api/admin/applicationKeys';

/** Admin > Application API: the credentials that manage this panel through the API. */
export default () => {
    const { data, error, mutate } = useApplicationKeys();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [revoking, setRevoking] = useState<ApplicationKey | null>(null);

    const revoke = () => {
        if (!revoking) return;
        clearFlashes('admin');
        deleteApplicationKey(revoking.identifier)
            .then(() => {
                mutate(
                    (current) => current && { keys: current.keys.filter((k) => k.identifier !== revoking.identifier) },
                    false
                );
                addFlash({ key: 'admin', type: 'success', message: 'The API key was revoked.' });
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setRevoking(null));
    };

    return (
        <AdminPage
            title={'Application API'}
            subtitle={'Control access credentials for managing this panel via the API.'}
        >
            <ListHeader
                icon={<KeyIcon className={'h-6 w-6'} />}
                title={'Credentials list'}
                count={data ? String(data.keys.length) : undefined}
            >
                <AdminLink to={'/admin/api/new'}>
                    <Button>
                        <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                        Create new
                    </Button>
                </AdminLink>
            </ListHeader>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white shadow-md'}>
                {!data ? (
                    error ? (
                        <p className={'p-6 text-sm text-red-600'}>The keys could not be loaded.</p>
                    ) : (
                        <Spinner size={'large'} centered />
                    )
                ) : data.keys.length === 0 ? (
                    <Empty>There are no application API keys yet.</Empty>
                ) : (
                    <AdminTable heads={['Key', 'Memo', 'Last used', 'Created', 'Created by', null]}>
                        {data.keys.map((key) => (
                            <Row key={key.identifier}>
                                <Cell>
                                    <code className={'text-xs'}>
                                        <Sensitive>{key.key}</Sensitive>
                                    </code>
                                </Cell>
                                <Cell>{key.memo}</Cell>
                                <Cell>
                                    {key.last_used_at
                                        ? formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })
                                        : '—'}
                                </Cell>
                                <Cell>{format(new Date(key.created_at), 'MMM do, yyyy HH:mm')}</Cell>
                                <Cell>
                                    <AdminLink to={`/admin/users/view/${key.user.id}`} className={'text-primary-600'}>
                                        {key.user.username}
                                    </AdminLink>
                                </Cell>
                                <Cell>
                                    <button
                                        type={'button'}
                                        title={'Revoke'}
                                        className={'text-red-500 hover:text-red-600'}
                                        onClick={() => setRevoking(key)}
                                    >
                                        <TrashIcon className={'h-4 w-4'} />
                                    </button>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                )}
            </div>
            <Dialog.Confirm
                open={!!revoking}
                title={'Revoke this API key?'}
                confirm={'Revoke'}
                onConfirmed={revoke}
                onClose={() => setRevoking(null)}
            >
                Anything that uses {revoking?.identifier} stops working.
            </Dialog.Confirm>
        </AdminPage>
    );
};

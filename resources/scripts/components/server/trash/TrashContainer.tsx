import React, { useEffect, useState } from 'react';
import { TrashIcon, FolderIcon, DocumentIcon, CalendarIcon } from '@heroicons/react/outline';
import { format } from 'date-fns';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState, ListHeader } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import GreyRowBox from '@/components/elements/GreyRowBox';
import Spinner from '@/components/elements/Spinner';
import Can from '@/components/elements/Can';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import { ServerContext } from '@/state/server';
import useFlash from '@/plugins/useFlash';
import { deleteTrashItem, emptyTrash, restoreTrashItem, TrashItem, useTrash } from '@/api/server/trash';
import { formatSize, originalPath, timeLeft } from '@/lib/trash';

const Icon = ({ type }: { type: TrashItem['type'] }) =>
    type === 'schedule' ? (
        <CalendarIcon className={'h-6 w-6 text-neutral-300'} />
    ) : type === 'directory' ? (
        <FolderIcon className={'h-6 w-6 text-neutral-300'} />
    ) : (
        <DocumentIcon className={'h-6 w-6 text-neutral-300'} />
    );

/** The trash bin of a server: what was deleted from it and can still be recovered. */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const { clearFlashes, clearAndAddHttpError, addFlash } = useFlash();
    const { data, error, mutate } = useTrash();
    const [busy, setBusy] = useState<string | null>(null);
    const [removing, setRemoving] = useState<TrashItem | 'all' | null>(null);

    useEffect(() => {
        clearAndAddHttpError({ key: 'trash', error });
    }, [error]);

    const restore = (item: TrashItem) => {
        clearFlashes('trash');
        setBusy(item.id);

        restoreTrashItem(uuid, item.id)
            .then((where) =>
                addFlash({
                    key: 'trash',
                    type: 'success',
                    title: 'Recovered',
                    message:
                        item.type === 'schedule'
                            ? `The ${where} schedule is back.`
                            : `${item.name} is back at ${where}.`,
                })
            )
            .catch((e) => clearAndAddHttpError({ key: 'trash', error: e }))
            .then(() => {
                setBusy(null);

                return mutate();
            });
    };

    const confirmRemoval = () => {
        const target = removing;
        if (!target) return;
        clearFlashes('trash');

        (target === 'all' ? emptyTrash(uuid) : deleteTrashItem(uuid, target.id))
            .catch((e) => clearAndAddHttpError({ key: 'trash', error: e }))
            .then(() => {
                setRemoving(null);

                return mutate();
            });
    };

    const items = data?.items ?? [];

    return (
        <ServerContentBlock title={'Trash'}>
            <PageHeader
                title={'Trash'}
                subtitle={
                    data?.enabled === false
                        ? `The trash bin is off, what is in it now is kept until it expires`
                        : `Deleted files and schedules of ${serverName} are kept for ${data?.retentionDays ?? 30} days`
                }
            />
            <FlashMessageRender byKey={'trash'} css={tw`mb-4`} />
            <Dialog.Confirm
                open={!!removing}
                title={removing === 'all' ? 'Empty the trash bin' : 'Delete for good'}
                confirm={removing === 'all' ? 'Empty it' : 'Delete'}
                onConfirmed={confirmRemoval}
                onClose={() => setRemoving(null)}
            >
                {removing === 'all'
                    ? 'Everything in the trash bin is deleted and can not be recovered.'
                    : `${removing ? removing.name : ''} is deleted and can not be recovered.`}
            </Dialog.Confirm>
            <ListHeader icon={<TrashIcon className={'h-6 w-6'} />} title={'Deleted'} count={`${items.length}`}>
                <Can action={'trash.delete'}>
                    {items.length > 0 && (
                        <Button.Danger
                            type={'button'}
                            variant={Button.Variants.Secondary}
                            onClick={() => setRemoving('all')}
                        >
                            Empty trash
                        </Button.Danger>
                    )}
                </Can>
            </ListHeader>
            {!data ? (
                <Spinner size={'large'} centered />
            ) : items.length === 0 ? (
                <EmptyState>The trash bin is empty.</EmptyState>
            ) : (
                items.map((item) => (
                    <GreyRowBox key={item.id} css={tw`mb-3 flex-wrap items-center`} $hoverable={false}>
                        <Icon type={item.type} />
                        <div css={tw`ml-4 flex-1 min-w-0`}>
                            <p css={tw`text-sm font-medium truncate`}>{item.name}</p>
                            <p css={tw`text-xs text-neutral-300 mt-1 truncate`}>
                                {item.type === 'schedule' ? 'Schedule' : originalPath(item.path, item.name)}
                                {formatSize(item.size) ? ` · ${formatSize(item.size)}` : ''}
                            </p>
                            <p css={tw`text-xs text-neutral-400 mt-1`}>
                                Deleted {item.deletedAt ? format(item.deletedAt, 'MMM do, yyyy HH:mm') : ''}
                                {item.deletedBy ? ` by ${item.deletedBy}` : ''} · {timeLeft(item.expiresAt)}
                            </p>
                        </div>
                        <div css={tw`flex items-center gap-2 mt-2 sm:mt-0`}>
                            <Can action={'trash.restore'}>
                                <Button
                                    type={'button'}
                                    size={Button.Sizes.Small}
                                    disabled={busy === item.id}
                                    onClick={() => restore(item)}
                                >
                                    Recover
                                </Button>
                            </Can>
                            <Can action={'trash.delete'}>
                                <Button.Danger
                                    type={'button'}
                                    size={Button.Sizes.Small}
                                    variant={Button.Variants.Secondary}
                                    onClick={() => setRemoving(item)}
                                >
                                    Delete
                                </Button.Danger>
                            </Can>
                        </div>
                    </GreyRowBox>
                ))
            )}
        </ServerContentBlock>
    );
};

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CogIcon, PuzzleIcon, ShieldCheckIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import { Empty, Pill } from '@/components/admin/AdminTable';
import { Notice } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import { clearExtensionError, ExtensionRow, toggleExtension, useExtensions } from '@/api/admin/extensions';

const State = ({ item }: { item: ExtensionRow }) =>
    !item.enabled ? (
        <Pill>Off</Pill>
    ) : item.failed || item.last_error ? (
        <Pill tone={'yellow'}>On, with a problem</Pill>
    ) : item.running ? (
        <Pill tone={'green'}>On</Pill>
    ) : (
        <Pill>On, not started</Pill>
    );

/** Admin > Extensions: what is installed, switched on or off, and its settings. */
export default () => {
    const { data, error, mutate } = useExtensions();
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();

    const act = (work: Promise<void>, message: string) => {
        clearFlashes('admin');
        work.then(() => {
            addFlash({ key: 'admin', type: 'success', message });
            return mutate();
        }).catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    };

    return (
        <AdminPage title={'Extensions'} subtitle={'Add-ons that run as a part of the panel.'}>
            <div className={'space-y-4'}>
                {data?.safe_mode && (
                    <Notice>
                        The panel is in <strong>safe mode</strong> (<code>STRATOSPHERE_EXTENSIONS=false</code> in{' '}
                        <code>.env</code>), no extension is started. Set it to <code>true</code> to bring them back.
                    </Notice>
                )}
                <SectionCard icon={<PuzzleIcon className={'h-5 w-5'} />} title={'Installed extensions'}>
                    {!data ? (
                        error ? (
                            <p className={'text-sm text-red-600'}>The extensions could not be loaded.</p>
                        ) : (
                            <Spinner size={'large'} centered />
                        )
                    ) : data.extensions.length === 0 ? (
                        <Empty>No extensions are installed yet.</Empty>
                    ) : (
                        <div className={'divide-y divide-neutral-500'}>
                            {data.extensions.map((item) => (
                                <div key={item.id} className={'flex flex-wrap items-start justify-between gap-4 py-4'}>
                                    <div className={'min-w-0 flex-1'}>
                                        <p className={'text-sm font-medium text-neutral-50'}>
                                            {item.name}{' '}
                                            <span className={'text-xs font-normal text-neutral-400'}>
                                                {item.version}
                                                {item.author ? ` by ${item.author}` : ''}
                                            </span>
                                        </p>
                                        <p className={'mt-1 text-xs text-neutral-300'}>
                                            {item.broken
                                                ? 'The files of this extension are missing or damaged, install it again.'
                                                : item.description}
                                        </p>
                                        <code className={'text-2xs'}>{item.id}</code>
                                        {item.last_error && (
                                            <div className={'mt-2'}>
                                                <Notice>
                                                    <strong>The panel carried on without it.</strong>{' '}
                                                    {item.last_error_at &&
                                                        formatDistanceToNow(new Date(item.last_error_at), {
                                                            addSuffix: true,
                                                        })}
                                                    <code className={'mt-1 block break-words text-xs'}>
                                                        {item.last_error}
                                                    </code>
                                                </Notice>
                                            </div>
                                        )}
                                    </div>
                                    <div className={'flex flex-wrap items-center gap-2'}>
                                        <State item={item} />
                                        {admin.can('extensions.manage') && (
                                            <Button.Text
                                                onClick={() =>
                                                    act(
                                                        toggleExtension(item.id),
                                                        `${item.name} is ${item.enabled ? 'off' : 'on'}.`
                                                    )
                                                }
                                            >
                                                {item.enabled ? 'Switch off' : 'Switch on'}
                                            </Button.Text>
                                        )}
                                        {item.has_settings && (
                                            <AdminLink to={`/admin/extensions/${item.id}/settings`}>
                                                <Button.Text>
                                                    <CogIcon className={'-ml-1 mr-1 h-4 w-4'} />
                                                    Settings
                                                </Button.Text>
                                            </AdminLink>
                                        )}
                                        {item.last_error && admin.can('extensions.manage') && (
                                            <Button.Text
                                                onClick={() =>
                                                    act(clearExtensionError(item.id), 'The error was dismissed.')
                                                }
                                            >
                                                Dismiss the error
                                            </Button.Text>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
                <SectionCard icon={<ShieldCheckIcon className={'h-5 w-5'} />} title={'Installing an extension'}>
                    <div className={'space-y-3 text-sm text-neutral-200'}>
                        <p>
                            An extension is a <code>.stratext</code> file. On the machine that runs the panel:
                        </p>
                        <pre className={'overflow-x-auto rounded-lg bg-neutral-700 p-3 text-xs'}>
                            php artisan p:extension:install path/to/extension.stratext
                        </pre>
                        <p className={'text-xs text-neutral-300'}>
                            A new extension is off until you switch it on here.{' '}
                            <strong>
                                An extension is PHP and JavaScript that runs as a part of the panel, with the same
                                access to everything in it.
                            </strong>{' '}
                            Only install extensions from people you trust. One that breaks is left out and the panel
                            carries on, the problem is shown here.{' '}
                            <code>php artisan p:extension:remove &lt;id&gt;</code> removes one,{' '}
                            <code>p:extension:list</code> lists them.
                        </p>
                    </div>
                </SectionCard>
            </div>
        </AdminPage>
    );
};

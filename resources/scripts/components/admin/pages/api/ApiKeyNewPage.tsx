import React, { useState } from 'react';
import classNames from 'classnames';
import { useHistory } from 'react-router-dom';
import { KeyIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import { AdminTable, Cell, Row } from '@/components/admin/AdminTable';
import { Notice, TextField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { createApplicationKey, useKeyResources } from '@/api/admin/applicationKeys';

type Level = 'none' | 'read' | 'write';

const label = (resource: string) => resource.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Admin > Application API > new: what a new key may read and change. */
export default () => {
    const { data } = useKeyResources();
    const history = useHistory();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [memo, setMemo] = useState('');
    const [chosen, setChosen] = useState<Record<string, Level>>({});
    const [busy, setBusy] = useState(false);

    const level = (resource: string): Level => chosen[resource] ?? 'none';
    const all = (to: Level) => setChosen(Object.fromEntries((data?.resources ?? []).map((r) => [r, to])));

    const create = () => {
        if (!data) return;
        clearFlashes('admin');
        setBusy(true);
        createApplicationKey(memo, Object.fromEntries(data.resources.map((r) => [r, data.levels[level(r)]])))
            .then(() => {
                addFlash({
                    key: 'admin',
                    type: 'success',
                    message: 'A new application API key has been generated for your account.',
                });
                history.push('/admin/api');
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setBusy(false);
            });
    };

    if (!data) return <Spinner size={'large'} centered />;

    return (
        <AdminPage title={'New credentials'} subtitle={'Choose what the key may do.'}>
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<KeyIcon className={'h-5 w-5'} />}
                    title={'Select permissions'}
                >
                    <div className={'mb-3 flex flex-wrap gap-2'}>
                        <Button.Text onClick={() => all('read')}>Read all</Button.Text>
                        <Button.Text onClick={() => all('write')}>Read &amp; write all</Button.Text>
                        <Button.Text onClick={() => all('none')}>None all</Button.Text>
                    </div>
                    <AdminTable heads={['Resource', 'Access']}>
                        {data.resources.map((resource) => (
                            <Row key={resource}>
                                <Cell className={'font-medium'}>{label(resource)}</Cell>
                                <Cell>
                                    <div
                                        role={'radiogroup'}
                                        aria-label={label(resource)}
                                        className={
                                            'ml-auto flex w-full max-w-xs overflow-hidden rounded-lg border border-neutral-500'
                                        }
                                    >
                                        {(
                                            [
                                                ['none', 'None'],
                                                ['read', 'Read'],
                                                ['write', 'Read & write'],
                                            ] as [Level, string][]
                                        ).map(([option, text]) => (
                                            <button
                                                key={option}
                                                type={'button'}
                                                role={'radio'}
                                                aria-checked={level(resource) === option}
                                                onClick={() => setChosen({ ...chosen, [resource]: option })}
                                                className={classNames(
                                                    'flex-1 px-3 py-1.5 text-xs font-medium transition-colors',
                                                    {
                                                        'bg-neutral-500 text-neutral-50':
                                                            level(resource) === option && option === 'none',
                                                        'bg-primary-600 text-white':
                                                            level(resource) === option && option !== 'none',
                                                        'text-neutral-300 hover:bg-neutral-600':
                                                            level(resource) !== option,
                                                    }
                                                )}
                                            >
                                                {text}
                                            </button>
                                        ))}
                                    </div>
                                </Cell>
                            </Row>
                        ))}
                    </AdminTable>
                </SectionCard>
                <SectionCard icon={<KeyIcon className={'h-5 w-5'} />} title={'Description'}>
                    <div className={'space-y-4'}>
                        <TextField id={'key-memo'} label={'Description'} value={memo} onChange={setMemo} />
                        <Notice tone={'blue'}>
                            Once you have assigned permissions and created this set of credentials you will be unable to
                            come back and edit it. If you need to make changes down the road you will need to create a
                            new set of credentials.
                        </Notice>
                        <Button onClick={create} disabled={busy || !memo.trim()}>
                            Create credentials
                        </Button>
                    </div>
                </SectionCard>
            </div>
        </AdminPage>
    );
};

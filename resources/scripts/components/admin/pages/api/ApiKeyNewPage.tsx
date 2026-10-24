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
                    <AdminTable heads={['Resource', 'Read', 'Read & write', 'None']}>
                        {data.resources.map((resource) => (
                            <Row key={resource}>
                                <Cell className={'font-medium'}>{label(resource)}</Cell>
                                {(['read', 'write', 'none'] as Level[]).map((option) => (
                                    <Cell key={option} className={classNames('text-center')}>
                                        <input
                                            type={'radio'}
                                            className={'form-input'}
                                            name={`level-${resource}`}
                                            aria-label={`${label(resource)} ${option}`}
                                            checked={level(resource) === option}
                                            onChange={() => setChosen({ ...chosen, [resource]: option })}
                                        />
                                    </Cell>
                                ))}
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

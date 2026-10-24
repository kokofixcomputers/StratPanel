import React from 'react';
import { useHistory } from 'react-router-dom';
import { LoginIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import { ProviderRow, useSetting } from '@/api/admin/settings';

/** Admin > Settings > Providers: the services people can sign in with and link to their account. */
export default () => {
    const admin = useAdmin();
    const history = useHistory();
    const { data } = useSetting<{ providers: ProviderRow[]; types: { type: string; name: string }[] }>('providers');
    const typeName = (type: string) => data?.types.find((t) => t.type === type)?.name ?? type;

    return (
        <SettingsFrame title={'Providers'} subtitle={'The services people can sign in with and link to their account.'}>
            {!data ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'grid gap-4 lg:grid-cols-3'}>
                    <SectionCard
                        className={'lg:col-span-2'}
                        icon={<LoginIcon className={'h-5 w-5'} />}
                        title={'Set up'}
                    >
                        {data.providers.length === 0 ? (
                            <Empty>Nothing is set up yet. Pick a service on the right to start.</Empty>
                        ) : (
                            <AdminTable heads={['Name', 'Type', 'Sign in', 'Sign up', 'Accounts']}>
                                {data.providers.map((provider) => (
                                    <Row
                                        key={provider.id}
                                        onClick={() => history.push(`/admin/settings/providers/${provider.id}`)}
                                    >
                                        <Cell className={'font-medium text-neutral-50'}>
                                            {provider.name} <code className={'text-2xs'}>{provider.key}</code>
                                        </Cell>
                                        <Cell>{typeName(provider.type)}</Cell>
                                        <Cell>
                                            <Pill tone={provider.enabled ? 'green' : 'neutral'}>
                                                {provider.enabled ? 'On' : 'Off'}
                                            </Pill>
                                        </Cell>
                                        <Cell>
                                            <Pill tone={provider.allow_signup ? 'green' : 'neutral'}>
                                                {provider.allow_signup ? 'Allowed' : 'No'}
                                            </Pill>
                                        </Cell>
                                        <Cell>{provider.accounts}</Cell>
                                    </Row>
                                ))}
                            </AdminTable>
                        )}
                    </SectionCard>
                    {admin.can('settings.providers.update') && (
                        <SectionCard icon={<LoginIcon className={'h-5 w-5'} />} title={'Add a service'}>
                            <div className={'flex flex-col gap-2'}>
                                {data.types.map((type) => (
                                    <Button.Text
                                        key={type.type}
                                        onClick={() => history.push(`/admin/settings/providers/new?type=${type.type}`)}
                                    >
                                        {type.type === 'oauth2' ? 'Other OAuth 2 service' : type.name}
                                    </Button.Text>
                                ))}
                            </div>
                        </SectionCard>
                    )}
                </div>
            )}
        </SettingsFrame>
    );
};

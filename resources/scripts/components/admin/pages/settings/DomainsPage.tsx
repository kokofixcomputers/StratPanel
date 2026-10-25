import React from 'react';
import { useHistory } from 'react-router-dom';
import { GlobeAltIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { AdminTable, Cell, Empty, Pill, Row } from '@/components/admin/AdminTable';
import { ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useFlash from '@/plugins/useFlash';
import { Domains, saveSetting, useSetting } from '@/api/admin/settings';

/** Admin > Settings > Domains: people bring their own domain, or take a name under a domain of the admin. */
export default () => {
    const admin = useAdmin();
    const history = useHistory();
    const { data, mutate } = useSetting<Domains>('domains');
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const can = admin.can('settings.domains.update');

    const toggle = (custom_enabled: boolean) => {
        clearFlashes('admin');
        saveSetting<Domains>('domains', { custom_enabled })
            .then((fresh) => {
                addFlash({ key: 'admin', type: 'success', message: 'Domain settings were saved.' });
                return mutate(fresh, false);
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    };

    return (
        <SettingsFrame title={'Domains'} subtitle={'Give servers a domain, their own or one of yours.'}>
            {!data ? (
                <Spinner size={'large'} centered />
            ) : (
                <div className={'space-y-4'}>
                    <SectionCard icon={<GlobeAltIcon className={'h-5 w-5'} />} title={'Their own domain'}>
                        <ToggleField
                            label={'People can bring a domain they own'}
                            help={`They add an A record at their own DNS provider that points at ${
                                data.target_ip ?? 'this panel'
                            }.${
                                data.target_ip
                                    ? ''
                                    : ' Set PTERODACTYL_DOMAINS_TARGET_IP, the address could not be found.'
                            }`}
                            checked={data.custom_enabled}
                            disabled={!can}
                            onChange={toggle}
                        />
                    </SectionCard>
                    <SectionCard
                        icon={<GlobeAltIcon className={'h-5 w-5'} />}
                        title={'Names under your domains'}
                        badge={
                            can && (
                                <div className={'flex gap-2'}>
                                    {data.types.map((type) => (
                                        <Button.Text
                                            key={type.type}
                                            onClick={() =>
                                                history.push(`/admin/settings/domains/new?type=${type.type}`)
                                            }
                                        >
                                            Add a domain{data.types.length > 1 ? ` at ${type.name}` : ''}
                                        </Button.Text>
                                    ))}
                                </div>
                            )
                        }
                    >
                        {data.zones.length === 0 ? (
                            <Empty>
                                No domain yet. Add one and people can type a name such as play and pick .example.com;
                                the panel makes the DNS record.
                            </Empty>
                        ) : (
                            <AdminTable heads={['Domain', 'DNS provider', 'Status', 'Names', 'Certificate']}>
                                {data.zones.map((zone) => (
                                    <Row
                                        key={zone.id}
                                        onClick={() => history.push(`/admin/settings/domains/zones/${zone.id}`)}
                                    >
                                        <Cell className={'font-medium text-neutral-50'}>
                                            {zone.domain}{' '}
                                            <span className={'text-xs font-normal text-neutral-400'}>{zone.name}</span>
                                        </Cell>
                                        <Cell>{data.types.find((t) => t.type === zone.type)?.name ?? zone.type}</Cell>
                                        <Cell>
                                            <Pill tone={zone.enabled ? 'green' : 'neutral'}>
                                                {zone.enabled ? 'Offered' : 'Off'}
                                            </Pill>
                                        </Cell>
                                        <Cell>{zone.names}</Cell>
                                        <Cell>
                                            {zone.certificate.status === 'pending' ? (
                                                <Pill tone={'primary'}>Getting one...</Pill>
                                            ) : zone.certificate.certificate ? (
                                                <Pill
                                                    tone={
                                                        zone.certificate.certificate.expired
                                                            ? 'red'
                                                            : zone.certificate.certificate.expiring
                                                            ? 'yellow'
                                                            : 'green'
                                                    }
                                                >
                                                    {zone.certificate.certificate.expired
                                                        ? 'Expired'
                                                        : `${zone.certificate.certificate.days_left} days`}
                                                </Pill>
                                            ) : zone.certificate.status === 'failed' ? (
                                                <Pill tone={'red'}>Failed</Pill>
                                            ) : (
                                                <Pill>None</Pill>
                                            )}
                                        </Cell>
                                    </Row>
                                ))}
                            </AdminTable>
                        )}
                        <p className={'mt-4 text-xs text-neutral-400'}>
                            A name under your domain is made when the person adds it and removed with it, at the DNS
                            provider of that domain. Both ways can be on at once; the people choose in the Domains page
                            of their server. Names that are kept for the panel (www, mail, admin, ...) cannot be taken.
                        </p>
                    </SectionCard>
                </div>
            )}
        </SettingsFrame>
    );
};

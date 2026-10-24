import React from 'react';
import { CogIcon, ServerIcon } from '@heroicons/react/solid';
import { AreaField, Columns, Notice, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import { NodeDetails, NodeInput } from '@/api/admin/nodes';

export const toInput = (node: NodeDetails): NodeInput => ({
    name: node.name,
    description: node.description ?? '',
    location_id: String(node.location_id),
    public: node.public,
    fqdn: node.fqdn,
    scheme: node.scheme,
    behind_proxy: node.behind_proxy,
    maintenance_mode: node.maintenance_mode,
    cpu_burst_enabled: node.cpu_burst_enabled,
    cpu_burst_percent: String(node.cpu_burst_percent),
    memory: String(node.memory),
    memory_overallocate: String(node.memory_overallocate),
    disk: String(node.disk),
    disk_overallocate: String(node.disk_overallocate),
    upload_size: String(node.upload_size),
    daemonListen: String(node.daemonListen),
    daemonSFTP: String(node.daemonSFTP),
    daemonBase: node.daemonBase,
    reset_secret: false,
});

export const BLANK: NodeInput = {
    name: '',
    description: '',
    location_id: '',
    public: true,
    fqdn: '',
    scheme: 'https',
    behind_proxy: false,
    maintenance_mode: false,
    cpu_burst_enabled: true,
    cpu_burst_percent: '100',
    memory: '',
    memory_overallocate: '0',
    disk: '',
    disk_overallocate: '0',
    upload_size: '100',
    daemonListen: '8080',
    daemonSFTP: '2022',
    daemonBase: '/var/lib/pterodactyl/volumes',
};

const OVERALLOCATE =
    'Enter the percentage of the total you want to allow on top of it. To disable checking for overallocation enter -1. Entering 0 means a server can never go over the total.';

/** The two cards of a node, for the page that makes one and the page that changes one. */
export default ({
    value,
    onChange,
    locations,
    secure,
    exists,
    disabled = false,
}: {
    value: NodeInput;
    onChange: (value: NodeInput) => void;
    locations: { id: number; short: string; long: string }[];
    secure: boolean;
    exists: boolean;
    disabled?: boolean;
}) => {
    const set = (changes: Partial<NodeInput>) => onChange({ ...value, ...changes });

    return (
        <div className={'grid gap-4 lg:grid-cols-2'}>
            <SectionCard icon={<ServerIcon className={'h-5 w-5'} />} title={exists ? 'Settings' : 'Basic details'}>
                <Stack>
                    <TextField
                        id={'node-name'}
                        label={'Name'}
                        value={value.name}
                        disabled={disabled}
                        onChange={(name) => set({ name })}
                        help={'Letters, numbers, spaces and _ . - (1 to 100 characters).'}
                    />
                    <AreaField
                        id={'node-description'}
                        label={'Description'}
                        rows={4}
                        value={value.description}
                        disabled={disabled}
                        onChange={(description) => set({ description })}
                    />
                    <SelectField
                        id={'node-location'}
                        label={'Location'}
                        value={value.location_id || String(locations[0]?.id ?? '')}
                        disabled={disabled}
                        choices={locations.map((l) => ({
                            value: String(l.id),
                            label: exists ? `${l.long} (${l.short})` : l.short,
                        }))}
                        onChange={(location_id) => set({ location_id })}
                    />
                    <ToggleField
                        label={exists ? 'Allow automatic allocation' : 'Public'}
                        help={
                            exists
                                ? 'Allow servers to be placed on this node automatically (auto-deploy).'
                                : 'A private node can not be auto-deployed to.'
                        }
                        checked={value.public}
                        disabled={disabled}
                        onChange={(on) => set({ public: on })}
                    />
                    <TextField
                        id={'node-fqdn'}
                        label={'Fully qualified domain name'}
                        value={value.fqdn}
                        disabled={disabled}
                        onChange={(fqdn) => set({ fqdn })}
                        help={
                            'The domain name (for example node.example.com) used to connect to the daemon. An IP address may be used only if you are not using SSL for this node.'
                        }
                    />
                    <ToggleField
                        label={'Communicate over SSL'}
                        help={
                            secure
                                ? 'This panel uses a secure connection. In order for browsers to connect to your node it must use SSL too.'
                                : 'In most cases you should use SSL. If you use an IP address or do not want SSL at all, switch it off.'
                        }
                        checked={value.scheme === 'https'}
                        disabled={disabled || (secure && value.scheme === 'https')}
                        onChange={(on) => set({ scheme: on ? 'https' : 'http' })}
                    />
                    <ToggleField
                        label={'Behind proxy'}
                        help={
                            'If the daemon runs behind a proxy such as Cloudflare, this makes the daemon skip looking for certificates on boot.'
                        }
                        checked={value.behind_proxy}
                        disabled={disabled}
                        onChange={(on) => set({ behind_proxy: on })}
                    />
                    {exists && (
                        <>
                            <ToggleField
                                label={'Maintenance mode'}
                                help={'Nobody can start or reach servers on a node in maintenance.'}
                                checked={value.maintenance_mode}
                                disabled={disabled}
                                onChange={(on) => set({ maintenance_mode: on })}
                            />
                            <ToggleField
                                label={'CPU burst'}
                                help={
                                    'A server that stays under its CPU limit saves up the CPU it did not use, up to this share of its limit, and can spend it on a short spike above the limit. It never raises the limit for good. Needs Linux 5.14 or newer on the node; a server whose node does this shows a bolt on its console page. Applies to a server the next time it starts.'
                                }
                                checked={value.cpu_burst_enabled}
                                disabled={disabled}
                                onChange={(on) => set({ cpu_burst_enabled: on })}
                            />
                            <TextField
                                id={'node-burst'}
                                type={'number'}
                                label={'Burst share (% of the limit)'}
                                value={value.cpu_burst_percent}
                                disabled={disabled}
                                onChange={(cpu_burst_percent) => set({ cpu_burst_percent })}
                            />
                        </>
                    )}
                </Stack>
            </SectionCard>

            <SectionCard
                icon={<CogIcon className={'h-5 w-5'} />}
                title={exists ? 'Allocation limits' : 'Configuration'}
            >
                <Stack>
                    {!exists && (
                        <TextField
                            id={'node-base'}
                            label={'Daemon server file directory'}
                            value={value.daemonBase}
                            onChange={(daemonBase) => set({ daemonBase })}
                            help={
                                'The directory where server files are stored. If you use OVH, check your partition scheme: you may need /home/daemon-data to have enough space.'
                            }
                        />
                    )}
                    <Columns>
                        <TextField
                            id={'node-memory'}
                            type={'number'}
                            label={'Total memory (MiB)'}
                            value={value.memory}
                            disabled={disabled}
                            onChange={(memory) => set({ memory })}
                        />
                        <TextField
                            id={'node-memory-over'}
                            type={'number'}
                            label={'Memory over-allocation (%)'}
                            value={value.memory_overallocate}
                            disabled={disabled}
                            onChange={(memory_overallocate) => set({ memory_overallocate })}
                        />
                    </Columns>
                    <p className={'-mt-2 text-xs text-neutral-400'}>
                        The total amount of memory available for new servers. {OVERALLOCATE}
                    </p>
                    <Columns>
                        <TextField
                            id={'node-disk'}
                            type={'number'}
                            label={'Total disk space (MiB)'}
                            value={value.disk}
                            disabled={disabled}
                            onChange={(disk) => set({ disk })}
                        />
                        <TextField
                            id={'node-disk-over'}
                            type={'number'}
                            label={'Disk over-allocation (%)'}
                            value={value.disk_overallocate}
                            disabled={disabled}
                            onChange={(disk_overallocate) => set({ disk_overallocate })}
                        />
                    </Columns>
                    <p className={'-mt-2 text-xs text-neutral-400'}>
                        The total amount of disk space available for new servers. {OVERALLOCATE}
                    </p>
                    {exists && (
                        <TextField
                            id={'node-upload'}
                            type={'number'}
                            label={'Maximum web upload size (MiB)'}
                            value={value.upload_size}
                            disabled={disabled}
                            onChange={(upload_size) => set({ upload_size })}
                            help={'The largest file that can be uploaded through the web file manager.'}
                        />
                    )}
                    <Columns>
                        <TextField
                            id={'node-listen'}
                            type={'number'}
                            label={'Daemon port'}
                            value={value.daemonListen}
                            disabled={disabled}
                            onChange={(daemonListen) => set({ daemonListen })}
                        />
                        <TextField
                            id={'node-sftp'}
                            type={'number'}
                            label={'Daemon SFTP port'}
                            value={value.daemonSFTP}
                            disabled={disabled}
                            onChange={(daemonSFTP) => set({ daemonSFTP })}
                        />
                    </Columns>
                    <p className={'-mt-2 text-xs text-neutral-400'}>
                        The daemon runs its own SFTP management container and does not use the SSHd process of the
                        machine. Do not use the same port you have assigned for that machine&apos;s SSH.
                    </p>
                    {exists && (
                        <>
                            <ToggleField
                                label={'Reset the daemon master key'}
                                help={
                                    'Resetting the daemon master key voids any request that uses the old key. This key is used for all sensitive operations on the daemon, including server creation and deletion. Changing it regularly is a good idea. The node needs the new configuration afterwards.'
                                }
                                checked={!!value.reset_secret}
                                disabled={disabled}
                                onChange={(reset_secret) => set({ reset_secret })}
                            />
                            {value.reset_secret && (
                                <Notice>
                                    The key is replaced when you save, and the node must be given the new configuration.
                                </Notice>
                            )}
                        </>
                    )}
                </Stack>
            </SectionCard>
        </div>
    );
};

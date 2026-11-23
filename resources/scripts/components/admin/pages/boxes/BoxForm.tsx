import React from 'react';
import { ChipIcon, CogIcon } from '@heroicons/react/solid';
import { AreaField, Columns, SelectField, Stack, TextField } from '@/components/admin/forms';
import OwnerSelect from '@/components/admin/pages/servers/OwnerSelect';
import SectionCard from '@/components/elements/SectionCard';

export interface BoxFormValue {
    name: string;
    owner: string;
    node: string;
    // The day it runs out (2027-01-31), empty: never.
    expires: string;
    notes: string;
    memory: string;
    disk: string;
    cpu: string;
    allocations: string;
    backups: string;
    databases: string;
}

export const EMPTY_BOX: BoxFormValue = {
    name: '',
    owner: '',
    node: '',
    expires: '',
    notes: '',
    memory: '4096',
    disk: '10240',
    cpu: '200',
    allocations: '3',
    backups: '3',
    databases: '1',
};

/** The cards of the form of a box, for making one and for changing one. The owner can only be chosen when it is made. */
export default ({
    value,
    onChange,
    nodes,
    ownerEditable,
    disabled = false,
}: {
    value: BoxFormValue;
    onChange: (value: BoxFormValue) => void;
    nodes: { id: number; name: string }[];
    ownerEditable: boolean;
    disabled?: boolean;
}) => {
    const set = (key: keyof BoxFormValue) => (v: string) => onChange({ ...value, [key]: v });

    return (
        <>
            <SectionCard icon={<CogIcon className={'h-5 w-5'} />} title={'Core details'}>
                <Columns>
                    <Stack>
                        <TextField
                            id={'box-name'}
                            label={'Box name'}
                            value={value.name}
                            disabled={disabled}
                            onChange={set('name')}
                            help={'What the owner sees on their Boxes page.'}
                        />
                        {ownerEditable && (
                            <OwnerSelect
                                id={'box-owner'}
                                label={'Box owner'}
                                value={value.owner}
                                onChange={set('owner')}
                                help={'Type the email address or username of the person and pick them.'}
                            />
                        )}
                    </Stack>
                    <Stack>
                        <SelectField
                            id={'box-node'}
                            label={'Node'}
                            value={value.node}
                            disabled={disabled}
                            onChange={set('node')}
                            choices={[
                                { value: '', label: 'Any node with room' },
                                ...nodes.map((n) => ({ value: String(n.id), label: n.name })),
                            ]}
                            help={
                                'The servers made in the box run on this node. Without one the owner picks a node for every server.'
                            }
                        />
                        <TextField
                            id={'box-expires'}
                            type={'text'}
                            label={'Runs out on'}
                            value={value.expires}
                            disabled={disabled}
                            placeholder={'2027-01-31'}
                            onChange={set('expires')}
                            help={
                                'A date like 2027-01-31, empty: the box never runs out. What runs out is suspended, never deleted.'
                            }
                        />
                    </Stack>
                </Columns>
                <AreaField
                    id={'box-notes'}
                    className={'mt-4'}
                    label={'Notes'}
                    value={value.notes}
                    rows={3}
                    disabled={disabled}
                    onChange={set('notes')}
                    help={'Only administrators see this.'}
                />
            </SectionCard>

            <SectionCard
                icon={<ChipIcon className={'h-5 w-5'} />}
                title={'Resources'}
                description={'What the servers in the box share. The owner chooses how much of it each server gets.'}
            >
                <Columns className={'sm:grid-cols-3'}>
                    <TextField
                        id={'box-memory'}
                        type={'number'}
                        label={'Memory (MiB)'}
                        value={value.memory}
                        disabled={disabled}
                        onChange={set('memory')}
                        help={'1024 MiB is 1 GiB.'}
                    />
                    <TextField
                        id={'box-disk'}
                        type={'number'}
                        label={'Disk space (MiB)'}
                        value={value.disk}
                        disabled={disabled}
                        onChange={set('disk')}
                        help={'10240 MiB is 10 GiB.'}
                    />
                    <TextField
                        id={'box-cpu'}
                        type={'number'}
                        label={'CPU limit (%)'}
                        value={value.cpu}
                        disabled={disabled}
                        onChange={set('cpu')}
                        help={'100 is one core.'}
                    />
                    <TextField
                        id={'box-ports'}
                        type={'number'}
                        label={'Ports (allocations)'}
                        value={value.allocations}
                        disabled={disabled}
                        onChange={set('allocations')}
                        help={'Every server needs at least one.'}
                    />
                    <TextField
                        id={'box-backups'}
                        type={'number'}
                        label={'Backups'}
                        value={value.backups}
                        disabled={disabled}
                        onChange={set('backups')}
                        help={'How many backups the servers may keep together.'}
                    />
                    <TextField
                        id={'box-dbs'}
                        type={'number'}
                        label={'Databases'}
                        value={value.databases}
                        disabled={disabled}
                        onChange={set('databases')}
                        help={'How many databases the servers may have together.'}
                    />
                </Columns>
            </SectionCard>
        </>
    );
};

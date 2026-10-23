import React from 'react';
import { AreaField, Columns, Stack, TextField, ToggleField } from '@/components/admin/forms';
import { MountInput } from '@/api/admin/mounts';

/** The fields of a mount, in the dialog that makes one and on the page of one. */
export default ({
    value,
    onChange,
    idPrefix,
    disabled = false,
}: {
    value: MountInput;
    onChange: (value: MountInput) => void;
    idPrefix: string;
    disabled?: boolean;
}) => {
    const set = (changes: Partial<MountInput>) => onChange({ ...value, ...changes });

    return (
        <Stack>
            <TextField
                id={`${idPrefix}-name`}
                label={'Name'}
                value={value.name}
                disabled={disabled}
                onChange={(name) => set({ name })}
                help={'A unique name that tells this mount from another.'}
            />
            <AreaField
                id={`${idPrefix}-description`}
                label={'Description'}
                value={value.description}
                disabled={disabled}
                maxLength={191}
                onChange={(description) => set({ description })}
                help={'A longer description of this mount, less than 191 characters.'}
            />
            <Columns>
                <TextField
                    id={`${idPrefix}-source`}
                    label={'Source'}
                    value={value.source}
                    disabled={disabled}
                    onChange={(source) => set({ source })}
                    help={'The path on the machine of the node that is mounted into a container.'}
                />
                <TextField
                    id={`${idPrefix}-target`}
                    label={'Target'}
                    value={value.target}
                    disabled={disabled}
                    onChange={(target) => set({ target })}
                    help={'Where the mount is found inside the container.'}
                />
            </Columns>
            <Columns>
                <ToggleField
                    label={'Read only'}
                    checked={value.read_only}
                    disabled={disabled}
                    onChange={(read_only) => set({ read_only })}
                    help={'The container can read the mount but not change it.'}
                />
                <ToggleField
                    label={'User mountable'}
                    checked={value.user_mountable}
                    disabled={disabled}
                    onChange={(user_mountable) => set({ user_mountable })}
                    help={'The owner of a server can add this mount to it.'}
                />
            </Columns>
        </Stack>
    );
};

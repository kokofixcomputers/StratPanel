import React from 'react';
import { Columns, SelectField, Stack, TextField } from '@/components/admin/forms';
import { ChoiceGroup } from '@/components/admin/forms';
import { HostInput } from '@/api/admin/databases';

/** The fields of a database host, in the dialog that makes one and on the page of one. */
export default ({
    value,
    onChange,
    nodes,
    idPrefix,
    isNew,
}: {
    value: HostInput;
    onChange: (value: HostInput) => void;
    nodes: ChoiceGroup[];
    idPrefix: string;
    isNew: boolean;
}) => {
    const set = (changes: Partial<HostInput>) => onChange({ ...value, ...changes });

    return (
        <Stack>
            <TextField
                id={`${idPrefix}-name`}
                label={'Name'}
                value={value.name}
                onChange={(name) => set({ name })}
                maxLength={191}
            />
            <Columns>
                <TextField
                    id={`${idPrefix}-host`}
                    label={'Host'}
                    value={value.host}
                    onChange={(host) => set({ host })}
                    help={
                        <>
                            The IP address or FQDN used to connect to this MySQL host <em>from the panel</em> to add new
                            databases.
                        </>
                    }
                />
                <TextField
                    id={`${idPrefix}-port`}
                    label={'Port'}
                    type={'number'}
                    value={value.port}
                    onChange={(port) => set({ port })}
                    help={'The port that MySQL is running on for this host.'}
                />
            </Columns>
            <Columns>
                <TextField
                    id={`${idPrefix}-username`}
                    label={'Username'}
                    value={value.username}
                    onChange={(username) => set({ username })}
                    autoComplete={'off'}
                    help={'An account that has enough permissions to create new users and databases on the system.'}
                />
                <TextField
                    id={`${idPrefix}-password`}
                    label={'Password'}
                    type={'password'}
                    value={value.password}
                    onChange={(password) => set({ password })}
                    autoComplete={'new-password'}
                    help={
                        isNew
                            ? 'The password of that account.'
                            : 'The password of that account. Leave it empty to keep the one in use.'
                    }
                />
            </Columns>
            <SelectField
                id={`${idPrefix}-node`}
                label={'Linked node'}
                value={value.node_id}
                onChange={(node_id) => set({ node_id })}
                choices={[{ value: '', label: 'None' }]}
                groups={nodes}
                help={'Only makes this host the default one when a database is added to a server on the selected node.'}
            />
        </Stack>
    );
};

export const HOST_WARNING = (
    <>
        The account of a database host <strong>must</strong> have the <code>WITH GRANT OPTION</code> permission. Without
        it requests to create databases <em>will</em> fail.{' '}
        <strong>Do not use the same account details that you have defined for this panel.</strong>
    </>
);

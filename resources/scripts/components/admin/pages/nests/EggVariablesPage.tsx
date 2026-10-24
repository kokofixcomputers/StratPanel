import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeftIcon, PlusIcon, VariableIcon } from '@heroicons/react/solid';
import AdminPage from '@/components/admin/AdminPage';
import AdminLink from '@/components/admin/AdminLink';
import EggTabs from '@/components/admin/pages/nests/EggTabs';
import { AreaField, Columns, Stack, TextField, ToggleField } from '@/components/admin/forms';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import useAdmin from '@/plugins/useAdmin';
import {
    createVariable,
    deleteVariable,
    EggVariable,
    updateVariable,
    useEggVariables,
    VariableInput,
} from '@/api/admin/nests';

const toInput = (variable: EggVariable): VariableInput => ({
    name: variable.name,
    description: variable.description,
    env_variable: variable.env_variable,
    default_value: variable.default_value,
    options: [
        ...(variable.user_viewable ? ['user_viewable'] : []),
        ...(variable.user_editable ? ['user_editable'] : []),
    ],
    rules: variable.rules,
});

const BLANK: VariableInput = {
    name: '',
    description: '',
    env_variable: '',
    default_value: '',
    options: [],
    rules: 'required|string|max:20',
};

const Fields = ({
    value,
    onChange,
    prefix,
    disabled,
}: {
    value: VariableInput;
    onChange: (value: VariableInput) => void;
    prefix: string;
    disabled: boolean;
}) => {
    const toggle = (option: string, on: boolean) =>
        onChange({ ...value, options: on ? [...value.options, option] : value.options.filter((o) => o !== option) });

    return (
        <Stack>
            <TextField
                id={`${prefix}-name`}
                label={'Name'}
                value={value.name}
                disabled={disabled}
                onChange={(name) => onChange({ ...value, name })}
            />
            <AreaField
                id={`${prefix}-description`}
                label={'Description'}
                rows={3}
                value={value.description}
                disabled={disabled}
                onChange={(description) => onChange({ ...value, description })}
            />
            <Columns>
                <TextField
                    id={`${prefix}-env`}
                    label={'Environment variable'}
                    value={value.env_variable}
                    disabled={disabled}
                    onChange={(env_variable) => onChange({ ...value, env_variable })}
                />
                <TextField
                    id={`${prefix}-default`}
                    label={'Default value'}
                    value={value.default_value}
                    disabled={disabled}
                    onChange={(default_value) => onChange({ ...value, default_value })}
                />
            </Columns>
            <p className={'-mt-2 text-xs text-neutral-400'}>
                This variable can be used in the startup command as{' '}
                <code>{`{{${value.env_variable || 'VARIABLE'}}}`}</code>.
            </p>
            <ToggleField
                label={'Users can view'}
                checked={value.options.includes('user_viewable')}
                disabled={disabled}
                onChange={(on) => toggle('user_viewable', on)}
            />
            <ToggleField
                label={'Users can edit'}
                checked={value.options.includes('user_editable')}
                disabled={disabled}
                onChange={(on) => toggle('user_editable', on)}
            />
            <TextField
                id={`${prefix}-rules`}
                label={'Input rules'}
                value={value.rules}
                placeholder={'required|string|max:20'}
                disabled={disabled}
                onChange={(rules) => onChange({ ...value, rules })}
                help={
                    <>
                        These rules are defined using standard{' '}
                        <a
                            href={'https://laravel.com/docs/11.x/validation#available-validation-rules'}
                            target={'_blank'}
                            rel={'noopener noreferrer'}
                        >
                            Laravel Framework validation rules
                        </a>
                        .
                    </>
                }
            />
        </Stack>
    );
};

/** One variable of an egg, as a card with its own save and delete. */
const VariableCard = ({
    eggId,
    variable,
    onChanged,
}: {
    eggId: number;
    variable: EggVariable;
    onChanged: () => void;
}) => {
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [value, setValue] = useState(toInput(variable));
    const [busy, setBusy] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const can = admin.can('eggs.update');

    useEffect(() => setValue(toInput(variable)), [variable]);

    const save = () => {
        clearFlashes('admin');
        setBusy(true);
        updateVariable(eggId, variable.id, value)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: `Variable ${variable.name} was updated.` });
                onChanged();
            })
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }))
            .then(() => setBusy(false));
    };

    const remove = () =>
        deleteVariable(eggId, variable.id)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: `Variable ${variable.name} was deleted.` });
                onChanged();
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setDeleting(false);
            });

    return (
        <SectionCard icon={<VariableIcon className={'h-5 w-5'} />} title={variable.name}>
            <Fields value={value} onChange={setValue} prefix={`var-${variable.id}`} disabled={!can} />
            {can && (
                <div className={'mt-6 flex justify-between gap-3'}>
                    <Button.Danger variant={Button.Variants.Secondary} onClick={() => setDeleting(true)}>
                        Delete
                    </Button.Danger>
                    <Button onClick={save} disabled={busy || !value.name.trim()}>
                        Save
                    </Button>
                </div>
            )}
            <Dialog.Confirm
                open={deleting}
                title={`Delete ${variable.name}?`}
                confirm={'Delete'}
                onConfirmed={remove}
                onClose={() => setDeleting(false)}
            >
                Servers lose the value they had for it.
            </Dialog.Confirm>
        </SectionCard>
    );
};

/** Admin > Nests > Eggs > Variables: what a person can set for a server of this egg. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data, error, mutate } = useEggVariables(id);
    const admin = useAdmin();
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [creating, setCreating] = useState(false);
    const [value, setValue] = useState(BLANK);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (error) clearAndAddHttpError({ key: 'admin', error });
    }, [error]);

    if (!data) return error ? null : <Spinner size={'large'} centered />;

    const create = () => {
        clearFlashes('admin');
        setBusy(true);
        createVariable(data.id, value)
            .then(() => {
                addFlash({ key: 'admin', type: 'success', message: 'The variable was created.' });
                setCreating(false);
                return mutate();
            })
            .catch((e) => {
                clearAndAddHttpError({ key: 'admin', error: e });
                setCreating(false);
            })
            .then(() => setBusy(false));
    };

    return (
        <AdminPage
            title={data.name}
            subtitle={'Variables of this egg.'}
            actions={
                <>
                    <AdminLink to={`/admin/nests/view/${data.nest.id}`}>
                        <Button.Text>
                            <ArrowLeftIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            {data.nest.name}
                        </Button.Text>
                    </AdminLink>
                    {admin.can('eggs.update') && (
                        <Button
                            onClick={() => {
                                setValue(BLANK);
                                setCreating(true);
                            }}
                        >
                            <PlusIcon className={'-ml-1 mr-2 h-4 w-4'} />
                            New variable
                        </Button>
                    )}
                </>
            }
        >
            <EggTabs id={data.id} />
            {data.variables.length === 0 ? (
                <p
                    className={
                        'rounded-xl border border-neutral-500 bg-white p-8 text-center text-sm text-neutral-400 shadow-md'
                    }
                >
                    This egg has no variables yet.
                </p>
            ) : (
                <div className={'grid gap-4 lg:grid-cols-2'}>
                    {data.variables.map((variable) => (
                        <VariableCard
                            key={variable.id}
                            eggId={data.id}
                            variable={variable}
                            onChanged={() => mutate()}
                        />
                    ))}
                </div>
            )}
            <Dialog open={creating} onClose={() => setCreating(false)} title={'Create an egg variable'}>
                <Fields value={value} onChange={setValue} prefix={'new-var'} disabled={false} />
                <Dialog.Footer>
                    <Button.Text onClick={() => setCreating(false)}>Cancel</Button.Text>
                    <Button onClick={create} disabled={busy || !value.name.trim() || !value.env_variable.trim()}>
                        Create variable
                    </Button>
                </Dialog.Footer>
            </Dialog>
        </AdminPage>
    );
};

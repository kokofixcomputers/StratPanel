import React, { useCallback, useEffect, useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import { CustomVariable, deleteEnvironment, getEnvironment, setEnvironment } from '@/api/server/environment';
import { Button } from '@/components/elements/button/index';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import Can from '@/components/elements/Can';
import FlashMessageRender from '@/components/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';

const FLASH = 'server:startup:custom';
export const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** One existing variable, its value is saved when the field loses focus. */
const Row = ({
    variable,
    onSave,
    onRemove,
}: {
    variable: CustomVariable;
    onSave: (value: string) => Promise<void>;
    onRemove: () => void;
}) => {
    const [value, setValue] = useState(variable.value);
    useEffect(() => setValue(variable.value), [variable.value]);

    return (
        <div className={'flex flex-wrap items-center gap-2 rounded-lg border border-neutral-500 bg-neutral-700/40 p-2'}>
            <code className={'w-full truncate rounded bg-neutral-600 px-2 py-1.5 text-sm sm:w-56'}>{variable.key}</code>
            <div className={'min-w-0 flex-1'}>
                <Can action={'startup.update'} renderOnError={<Input readOnly value={value} />}>
                    <Input
                        value={value}
                        aria-label={`Value of ${variable.key}`}
                        onChange={(e) => setValue(e.currentTarget.value)}
                        onBlur={() => value !== variable.value && onSave(value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                </Can>
            </div>
            <Can action={'startup.update'}>
                <button
                    type={'button'}
                    aria-label={`Remove ${variable.key}`}
                    onClick={onRemove}
                    className={
                        'rounded-lg p-2 text-neutral-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600'
                    }
                >
                    <TrashIcon className={'h-4 w-4'} />
                </button>
            </Can>
        </div>
    );
};

/** Environment variables the user adds themselves, on top of the ones the egg defines. */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const { addFlash, clearFlashes } = useFlash();
    const [variables, setVariables] = useState<CustomVariable[] | null>(null);
    const [max, setMax] = useState(50);
    const [name, setName] = useState('');
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);

    const fail = (e: unknown) => addFlash({ key: FLASH, type: 'error', message: httpErrorToHuman(e) });

    const load = useCallback(
        () =>
            getEnvironment(uuid)
                .then((result) => {
                    setVariables(result.variables);
                    setMax(result.max);
                })
                .catch(fail),
        [uuid]
    );

    useEffect(() => {
        load();
    }, [load]);

    const save = async (key: string, newValue: string) => {
        clearFlashes(FLASH);
        try {
            const saved = await setEnvironment(uuid, key, newValue);
            setVariables((list) => {
                const rest = (list || []).filter((v) => v.key !== saved.key);

                return [...rest, saved].sort((a, b) => a.key.localeCompare(b.key));
            });
        } catch (e) {
            fail(e);
            await load();
        }
    };

    const add = async () => {
        setBusy(true);
        await save(name.trim(), value);
        setName('');
        setValue('');
        setBusy(false);
    };

    const remove = async (key: string) => {
        clearFlashes(FLASH);
        try {
            await deleteEnvironment(uuid, key);
            setVariables((list) => (list || []).filter((v) => v.key !== key));
        } catch (e) {
            fail(e);
        }
    };

    const trimmed = name.trim();
    const invalid = trimmed.length > 0 && !VALID_NAME.test(trimmed);
    const full = !!variables && variables.length >= max;

    return (
        <div className={'rounded-xl border border-neutral-500 bg-white shadow-md'}>
            <div className={'border-b border-neutral-500 px-5 py-4'}>
                <p className={'text-sm font-semibold text-neutral-50'}>Custom variables</p>
                <p className={'mt-0.5 text-xs text-neutral-400'}>
                    Your own environment variables for the server process. They are passed to the server the next time
                    it starts, so restart it after changing them. They cannot replace the variables above or the ones
                    the panel sets itself.
                </p>
            </div>
            <div className={'space-y-2 p-5'}>
                <FlashMessageRender byKey={FLASH} className={'mb-2'} />
                {!variables ? (
                    <Spinner centered size={'base'} />
                ) : variables.length === 0 ? (
                    <p className={'py-2 text-center text-sm text-neutral-400'}>No custom variables yet.</p>
                ) : (
                    variables.map((variable) => (
                        <Row
                            key={variable.key}
                            variable={variable}
                            onSave={(newValue) => save(variable.key, newValue)}
                            onRemove={() => remove(variable.key)}
                        />
                    ))
                )}
                <Can action={'startup.update'}>
                    <div className={'flex flex-wrap items-start gap-2 pt-3'}>
                        <div className={'w-full sm:w-56'}>
                            <Input
                                value={name}
                                placeholder={'NAME'}
                                aria-label={'Variable name'}
                                style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
                                onChange={(e) => setName(e.currentTarget.value.replace(/\s/g, ''))}
                            />
                            {invalid && (
                                <p className={'mt-1 text-xs text-red-600'}>
                                    Use letters, numbers and underscores, and do not start with a number.
                                </p>
                            )}
                        </div>
                        <div className={'min-w-0 flex-1'}>
                            <Input
                                value={value}
                                placeholder={'value'}
                                aria-label={'Variable value'}
                                onChange={(e) => setValue(e.currentTarget.value)}
                                onKeyDown={(e) => e.key === 'Enter' && trimmed && !invalid && !full && add()}
                            />
                        </div>
                        <Button disabled={!trimmed || invalid || full || busy} onClick={add}>
                            <PlusIcon className={'mr-2 -ml-1 h-4 w-4'} />
                            Add
                        </Button>
                    </div>
                    {full && (
                        <p className={'text-xs text-neutral-400'}>You have reached the limit of {max} variables.</p>
                    )}
                </Can>
            </div>
        </div>
    );
};

import React from 'react';
import { Button } from '@/components/elements/button/index';
import { Options } from '@/components/elements/button/types';
import { Columns, Notice, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import { UserInput } from '@/api/admin/users';

/** A password of letters and numbers, made in the browser. */
export const generatePassword = (length = 16): string => {
    const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint32Array(length);
    window.crypto.getRandomValues(bytes);

    return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
};

/** The fields of a user, on the page that makes one and on the page of one. */
export default ({
    value,
    onChange,
    languages,
    isNew,
    canMakeRoot,
    disabled = false,
}: {
    value: UserInput;
    onChange: (value: UserInput) => void;
    languages: Record<string, string>;
    isNew: boolean;
    // Only root admins make root admins.
    canMakeRoot: boolean;
    disabled?: boolean;
}) => {
    const set = (changes: Partial<UserInput>) => onChange({ ...value, ...changes });

    return (
        <Stack>
            <Columns>
                <TextField
                    id={'user-email'}
                    label={'Email'}
                    type={'email'}
                    value={value.email}
                    disabled={disabled}
                    autoComplete={'off'}
                    onChange={(email) => set({ email })}
                />
                <TextField
                    id={'user-username'}
                    label={'Username'}
                    value={value.username}
                    disabled={disabled}
                    autoComplete={'off'}
                    onChange={(username) => set({ username })}
                />
            </Columns>
            <Columns>
                <TextField
                    id={'user-first'}
                    label={'Client first name'}
                    value={value.name_first}
                    disabled={disabled}
                    autoComplete={'off'}
                    onChange={(name_first) => set({ name_first })}
                />
                <TextField
                    id={'user-last'}
                    label={'Client last name'}
                    value={value.name_last}
                    disabled={disabled}
                    autoComplete={'off'}
                    onChange={(name_last) => set({ name_last })}
                />
            </Columns>
            <SelectField
                id={'user-language'}
                label={'Default language'}
                value={value.language}
                disabled={disabled}
                onChange={(language) => set({ language })}
                choices={Object.entries(languages).map(([code, name]) => ({ value: code, label: name }))}
                help={'The language the panel is shown in for this person.'}
            />
            <div>
                <TextField
                    id={'user-password'}
                    label={isNew ? 'Password (optional)' : 'New password (optional)'}
                    type={'text'}
                    value={value.password}
                    disabled={disabled}
                    autoComplete={'off'}
                    onChange={(password) => set({ password })}
                    help={
                        isNew
                            ? 'New user emails prompt people to choose a password the first time they sign in. If you give one here, you have to find another way to tell it to the person.'
                            : 'Leave it empty to keep the password as it is. The person is not told when it is changed.'
                    }
                />
                {!disabled && (
                    <Button.Text
                        type={'button'}
                        className={'mt-2'}
                        variant={Options.Variant.Secondary}
                        onClick={() => set({ password: generatePassword() })}
                    >
                        Generate a password
                    </Button.Text>
                )}
            </div>
            {canMakeRoot ? (
                <ToggleField
                    label={'Root admin'}
                    checked={value.root_admin}
                    disabled={disabled}
                    onChange={(root_admin) => set({ root_admin })}
                    help={
                        'A root admin can do everything and can not be limited by roles. Give this to very few people, the others get roles.'
                    }
                />
            ) : (
                <Notice tone={'blue'}>
                    {value.root_admin ? 'This person is a root admin. ' : 'This person is not a root admin. '}
                    Only root admins make root admins; roles are given on this page once the person exists.
                </Notice>
            )}
        </Stack>
    );
};

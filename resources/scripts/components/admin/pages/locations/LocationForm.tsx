import React from 'react';
import Input, { Textarea } from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import { LocationInput } from '@/api/admin/locations';

/** The two fields of a location, in the dialog that makes one and on the page that changes one. */
export default ({
    value,
    onChange,
    disabled = false,
    idPrefix,
}: {
    value: LocationInput;
    onChange: (value: LocationInput) => void;
    disabled?: boolean;
    idPrefix: string;
}) => (
    <>
        <Label htmlFor={`${idPrefix}-short`}>Short code</Label>
        <Input
            id={`${idPrefix}-short`}
            type={'text'}
            maxLength={60}
            value={value.short}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, short: e.currentTarget.value })}
        />
        <p className={'input-help'}>
            A short identifier used to distinguish this location from others. Between 1 and 60 characters, for example{' '}
            <code>us.nyc.lvl3</code>.
        </p>
        <div className={'mt-4'}>
            <Label htmlFor={`${idPrefix}-long`}>Description</Label>
            <Textarea
                id={`${idPrefix}-long`}
                rows={4}
                maxLength={191}
                value={value.long}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, long: e.currentTarget.value })}
            />
            <p className={'input-help'}>A longer description of this location. Less than 191 characters.</p>
        </div>
    </>
);

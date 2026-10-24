import React, { useRef } from 'react';
import { AreaField } from '@/components/admin/forms';
import { Button } from '@/components/elements/button/index';

/** A text area for a certificate or a key, that can also take the content of a file (it is read here, in the browser). */
export default ({
    id,
    label,
    value,
    onChange,
    help,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    help?: string;
}) => {
    const picker = useRef<HTMLInputElement>(null);

    return (
        <div>
            <AreaField id={id} label={label} value={value} rows={5} onChange={onChange} help={help} />
            <input
                ref={picker}
                type={'file'}
                className={'hidden'}
                onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) file.text().then(onChange);
                    e.currentTarget.value = '';
                }}
            />
            <Button.Text onClick={() => picker.current?.click()}>Choose a file</Button.Text>
        </div>
    );
};

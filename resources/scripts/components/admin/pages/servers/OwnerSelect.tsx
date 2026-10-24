import React, { useEffect, useRef, useState } from 'react';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import Sensitive from '@/components/elements/Sensitive';
import { findPeople, getPerson, Person } from '@/api/admin/servers';

/** Chooses a person by their email address or username: type two letters and pick. */
export default ({
    id,
    label,
    value,
    onChange,
    help,
    disabled = false,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (id: string) => void;
    help?: string;
    disabled?: boolean;
}) => {
    const [chosen, setChosen] = useState<Person | null>(null);
    const [term, setTerm] = useState('');
    const [found, setFound] = useState<Person[]>([]);
    const [open, setOpen] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>();

    // The person who is chosen already (an existing server, a file that was read) is looked up by their id.
    useEffect(() => {
        if (!value) return setChosen(null);
        if (chosen && String(chosen.id) === value) return;
        getPerson(Number(value))
            .then((person) => setChosen(person ?? null))
            .catch(() => setChosen(null));
    }, [value]);

    const search = (text: string) => {
        setTerm(text);
        if (timer.current) clearTimeout(timer.current);
        if (text.trim().length < 2) return setFound([]);
        timer.current = setTimeout(
            () =>
                findPeople(text.trim())
                    .then(setFound)
                    .catch(() => setFound([])),
            250
        );
    };

    return (
        <div className={'relative'}>
            <Label htmlFor={id}>{label}</Label>
            {chosen && !open ? (
                <button
                    type={'button'}
                    id={id}
                    disabled={disabled}
                    onClick={() => setOpen(true)}
                    className={
                        'flex w-full items-center gap-2 rounded border border-neutral-500 bg-white p-2 text-left text-sm'
                    }
                >
                    <img src={chosen.gravatar} alt={''} className={'h-6 w-6 rounded'} />
                    <span className={'text-neutral-100'}>
                        {chosen.name_first} {chosen.name_last}{' '}
                        <span className={'text-neutral-400'}>
                            (<Sensitive>{chosen.email}</Sensitive>)
                        </span>
                    </span>
                </button>
            ) : (
                <Input
                    id={id}
                    value={term}
                    autoComplete={'off'}
                    disabled={disabled}
                    placeholder={'Type an email address or a username'}
                    onFocus={() => setOpen(true)}
                    onChange={(e) => search(e.currentTarget.value)}
                />
            )}
            {open && found.length > 0 && (
                <ul
                    className={
                        'absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded border border-neutral-500 bg-white shadow-lg'
                    }
                >
                    {found.map((person) => (
                        <li key={person.id}>
                            <button
                                type={'button'}
                                className={'flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-neutral-600'}
                                onClick={() => {
                                    setChosen(person);
                                    setOpen(false);
                                    setFound([]);
                                    setTerm('');
                                    onChange(String(person.id));
                                }}
                            >
                                <img src={person.gravatar} alt={''} className={'h-6 w-6 rounded'} />
                                <span>
                                    <strong>
                                        <Sensitive>{person.email}</Sensitive>
                                    </strong>{' '}
                                    - {person.username}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {help && <p className={'input-help'}>{help}</p>}
        </div>
    );
};

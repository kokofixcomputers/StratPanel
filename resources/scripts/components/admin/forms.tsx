import React from 'react';
import classNames from 'classnames';
import Input, { Textarea } from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import Select from '@/components/elements/Select';
import { Switch } from '@/components/admin/theme/controls';

/**
 * The fields of the forms of the admin area, in the style of the rest of the app: a label, the input of the panel, and a hint under it. The
 * values are plain strings (the server checks them), so a page keeps one object of them in its state.
 */
interface Common {
    id: string;
    label: string;
    help?: React.ReactNode;
    disabled?: boolean;
    className?: string;
}

const Help = ({ children }: { children?: React.ReactNode }) =>
    children ? <p className={'input-help'}>{children}</p> : null;

export const TextField = ({
    id,
    label,
    help,
    value,
    onChange,
    type = 'text',
    placeholder,
    maxLength,
    disabled,
    className,
    autoComplete,
}: Common & {
    value: string;
    onChange: (value: string) => void;
    type?: 'text' | 'password' | 'number' | 'email' | 'url';
    placeholder?: string;
    maxLength?: number;
    autoComplete?: string;
}) => (
    <div className={className}>
        <Label htmlFor={id}>{label}</Label>
        <Input
            id={id}
            type={type}
            value={value}
            placeholder={placeholder}
            maxLength={maxLength}
            disabled={disabled}
            autoComplete={autoComplete}
            onChange={(e) => onChange(e.currentTarget.value)}
        />
        <Help>{help}</Help>
    </div>
);

export const AreaField = ({
    id,
    label,
    help,
    value,
    onChange,
    rows = 4,
    maxLength,
    disabled,
    className,
    mono = false,
}: Common & {
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    maxLength?: number;
    // Code or configuration: fixed width letters, and a tab key that indents.
    mono?: boolean;
}) => (
    <div className={className}>
        <Label htmlFor={id}>{label}</Label>
        <Textarea
            id={id}
            rows={rows}
            maxLength={maxLength}
            value={value}
            disabled={disabled}
            spellCheck={mono ? false : undefined}
            className={mono ? 'font-mono text-xs' : undefined}
            onChange={(e) => onChange(e.currentTarget.value)}
            onKeyDown={
                mono
                    ? (e) => {
                          if (e.key !== 'Tab' || e.shiftKey) return;
                          e.preventDefault();
                          const field = e.currentTarget;
                          const at = field.selectionStart;
                          onChange(`${value.slice(0, at)}    ${value.slice(field.selectionEnd)}`);
                          requestAnimationFrame(() => field.setSelectionRange(at + 4, at + 4));
                      }
                    : undefined
            }
        />
        <Help>{help}</Help>
    </div>
);

export interface Choice {
    value: string;
    label: string;
}

export interface ChoiceGroup {
    label: string;
    choices: Choice[];
}

export const SelectField = ({
    id,
    label,
    help,
    value,
    onChange,
    choices = [],
    groups = [],
    disabled,
    className,
}: Common & { value: string; onChange: (value: string) => void; choices?: Choice[]; groups?: ChoiceGroup[] }) => (
    <div className={className}>
        <Label htmlFor={id}>{label}</Label>
        <Select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.currentTarget.value)}>
            {choices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                    {choice.label}
                </option>
            ))}
            {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                    {group.choices.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                            {choice.label}
                        </option>
                    ))}
                </optgroup>
            ))}
        </Select>
        <Help>{help}</Help>
    </div>
);

/** A switch with what it does on its left and a hint under it. */
export const ToggleField = ({
    label,
    help,
    checked,
    onChange,
    disabled = false,
    className,
}: Omit<Common, 'id'> & { checked: boolean; onChange: (checked: boolean) => void }) => (
    <div className={classNames(disabled && 'opacity-60', className)}>
        <div className={'flex items-center justify-between gap-4 text-sm text-neutral-200'}>
            <span className={'font-medium'}>{label}</span>
            <Switch checked={checked} onChange={(value) => !disabled && onChange(value)} label={label} />
        </div>
        <Help>{help}</Help>
    </div>
);

/** Fields side by side on a wide screen, one under the other on a narrow one. */
export const Columns = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={classNames('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
);

/** Fields one under the other with room between them. */
export const Stack = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={classNames('space-y-4', className)}>{children}</div>
);

/** A box with a warning in the colours of the app. */
export const Notice = ({
    tone = 'yellow',
    children,
}: {
    tone?: 'yellow' | 'red' | 'blue';
    children: React.ReactNode;
}) => (
    <div
        className={classNames('rounded-lg border px-4 py-3 text-sm', {
            'border-yellow-200 bg-yellow-50 text-yellow-800': tone === 'yellow',
            'border-red-200 bg-red-50 text-red-800': tone === 'red',
            'border-primary-600/30 bg-primary-50 text-primary-700': tone === 'blue',
        })}
    >
        {children}
    </div>
);

export interface CheckGroup {
    label: string;
    items: { id: number; label: string }[];
}

/** A list of things to tick, in groups (the eggs of each nest, the nodes of each location). */
export const CheckList = ({
    groups,
    selected,
    onChange,
    taken = [],
    empty = 'There is nothing to choose from.',
}: {
    groups: CheckGroup[];
    selected: number[];
    onChange: (selected: number[]) => void;
    // What is there already: shown ticked and can not be changed.
    taken?: number[];
    empty?: string;
}) => {
    const shown = groups.filter((group) => group.items.length > 0);
    if (shown.length === 0) return <p className={'text-sm text-neutral-400'}>{empty}</p>;

    return (
        <div className={'max-h-80 space-y-3 overflow-y-auto rounded-lg border border-neutral-500 p-3'}>
            {shown.map((group) => (
                <div key={group.label}>
                    <p className={'mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>
                        {group.label}
                    </p>
                    {group.items.map((item) => {
                        const already = taken.includes(item.id);

                        return (
                            <label
                                key={item.id}
                                className={classNames(
                                    'flex cursor-pointer items-center gap-3 rounded px-1 py-1 text-sm text-neutral-100 hover:bg-neutral-600',
                                    already && 'cursor-default opacity-60'
                                )}
                            >
                                <input
                                    type={'checkbox'}
                                    className={'form-input'}
                                    checked={already || selected.includes(item.id)}
                                    disabled={already}
                                    onChange={(e) =>
                                        onChange(
                                            e.currentTarget.checked
                                                ? [...selected, item.id]
                                                : selected.filter((id) => id !== item.id)
                                        )
                                    }
                                />
                                {item.label}
                            </label>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

/** A row of joined choices where one is on, in the tint the rest of the app uses for what is chosen. */
export function SegmentedSwitch<T extends string | number>({
    value,
    options,
    onChange,
    label,
    disabled = false,
    className,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
    label: string;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <div
            role={'radiogroup'}
            aria-label={label}
            className={classNames('inline-flex rounded-lg border border-neutral-500 p-1', className)}
        >
            {options.map((option) => {
                const on = option.value === value;

                return (
                    <button
                        key={String(option.value)}
                        type={'button'}
                        role={'radio'}
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => onChange(option.value)}
                        className={classNames(
                            'flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors',
                            {
                                'bg-primary-50 text-primary-700 shadow-sm': on,
                                'text-neutral-300 hover:bg-neutral-600': !on && !disabled,
                                'text-neutral-400': !on && disabled,
                            }
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}

import React from 'react';
import classNames from 'classnames';

export type TriValue = 'default' | 'grant' | 'deny';

const LABELS: Record<TriValue, string> = { default: 'Default', grant: 'Grant', deny: 'Deny' };

/** The three choices of a permission of a role: say nothing, grant it or deny it. */
export default ({
    value,
    onChange,
    disabled = false,
    grantDisabled = false,
    label,
}: {
    value: TriValue;
    onChange: (value: TriValue) => void;
    disabled?: boolean;
    grantDisabled?: boolean;
    label: string;
}) => (
    <div
        role={'radiogroup'}
        aria-label={label}
        className={'inline-flex flex-shrink-0 overflow-hidden rounded-lg border border-neutral-500'}
    >
        {(['default', 'grant', 'deny'] as TriValue[]).map((option) => {
            const off = disabled || (option === 'grant' && grantDisabled);

            return (
                <button
                    key={option}
                    type={'button'}
                    role={'radio'}
                    aria-checked={value === option}
                    disabled={off}
                    onClick={() => onChange(option)}
                    className={classNames(
                        'min-w-[3.9rem] border-r border-neutral-500 px-2.5 py-1 text-xs last:border-r-0 transition-colors',
                        off && 'cursor-not-allowed opacity-50',
                        value === option
                            ? {
                                  'bg-neutral-600 font-semibold text-neutral-50': option === 'default',
                                  'bg-green-50 font-semibold text-green-700': option === 'grant',
                                  'bg-red-50 font-semibold text-red-700': option === 'deny',
                              }
                            : 'bg-white text-neutral-400 hover:text-neutral-100'
                    )}
                >
                    {LABELS[option]}
                </button>
            );
        })}
    </div>
);

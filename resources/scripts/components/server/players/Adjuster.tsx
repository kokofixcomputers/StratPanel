import React from 'react';
import classNames from 'classnames';
import { MinusIcon, PlusIcon } from '@heroicons/react/solid';

export interface Step {
    // What is added, or taken away when it is negative.
    delta: number;
    // Whether it can be done now: a full bar cannot get more.
    enabled: boolean;
}

interface Props {
    label: string;
    // How much one click is, in words.
    hint: string;
    steps: Step[];
    disabled: boolean;
    disabledReason?: string;
    onStep: (delta: number) => void;
}

/** A row of buttons that add to or take from one of the numbers of a player, such as the level. */
export default ({ label, hint, steps, disabled, disabledReason, onStep }: Props) => (
    <div className={'flex items-center justify-between gap-4'}>
        <div className={'min-w-0'}>
            <p className={'text-sm font-medium text-neutral-50'}>{label}</p>
            <p className={'text-xs text-neutral-400'}>{hint}</p>
        </div>
        <div className={'flex flex-shrink-0 items-center gap-1.5'} title={disabled ? disabledReason : undefined}>
            {steps.map((step) => {
                const taking = step.delta < 0;
                const Icon = taking ? MinusIcon : PlusIcon;

                return (
                    <button
                        key={step.delta}
                        type={'button'}
                        disabled={disabled || !step.enabled}
                        onClick={() => onStep(step.delta)}
                        aria-label={`${taking ? 'Take' : 'Add'} ${Math.abs(step.delta)} ${label.toLowerCase()}`}
                        className={classNames(
                            'inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-lg border px-2 text-xs font-semibold transition-colors duration-150',
                            'disabled:cursor-not-allowed disabled:opacity-40',
                            taking
                                ? 'border-neutral-500 bg-white text-neutral-200 hover:bg-neutral-600'
                                : 'border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100'
                        )}
                    >
                        <Icon className={'h-3.5 w-3.5'} />
                        {Math.abs(step.delta) > 1 && <span className={'ml-0.5'}>{Math.abs(step.delta)}</span>}
                    </button>
                );
            })}
        </div>
    </div>
);

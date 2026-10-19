import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { BanIcon, ChatAlt2Icon, LogoutIcon } from '@heroicons/react/outline';
import { banCommand, kickCommand, MAX_TEXT, whisperCommand } from '@/lib/playerCommands';

type Mode = 'whisper' | 'kick' | 'ban';

const MODES: Record<Mode, { label: string; placeholder: string; submit: string; done: string; danger?: boolean }> = {
    whisper: { label: 'Whisper', placeholder: 'Message, only they see it', submit: 'Send', done: 'Message sent to' },
    kick: { label: 'Kick', placeholder: 'Reason (optional)', submit: 'Kick', done: 'Kicked', danger: true },
    ban: { label: 'Ban', placeholder: 'Reason (optional)', submit: 'Ban', done: 'Banned', danger: true },
};

const ICONS = { whisper: ChatAlt2Icon, kick: LogoutIcon, ban: BanIcon };

/**
 * Whisper, kick and ban for the player of the window, as commands on the console of the server. A reason or a message is typed in
 * a line under the buttons. Whispering and kicking need the player to be online; banning works for anyone.
 */
export default ({
    name,
    online,
    allowed,
    running,
    send,
}: {
    name: string;
    online: boolean;
    // The person may use the console of the server.
    allowed: boolean;
    running: boolean;
    send: (command: string) => void;
}) => {
    const [mode, setMode] = useState<Mode | null>(null);
    const [text, setText] = useState('');
    const [done, setDone] = useState<string | null>(null);
    const field = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (mode) field.current?.focus();
    }, [mode]);
    useEffect(() => {
        if (!done) return;
        const timer = setTimeout(() => setDone(null), 4000);

        return () => clearTimeout(timer);
    }, [done]);
    // Another player, another form.
    useEffect(() => {
        setMode(null);
        setText('');
    }, [name]);

    const ready = allowed && running;
    const why = !allowed
        ? 'You are not allowed to use the console of this server'
        : !running
        ? 'The server is not running'
        : undefined;
    const needsOnline = (m: Mode) => m !== 'ban' && !online;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!mode || !ready) return;
        const command = (mode === 'whisper' ? whisperCommand : mode === 'kick' ? kickCommand : banCommand)(name, text);
        if (!command) return;
        send(command);
        setDone(`${MODES[mode].done} ${name}`);
        setMode(null);
        setText('');
    };

    return (
        <div className={'mb-5'}>
            <div className={'flex flex-wrap items-center gap-2'}>
                {(Object.keys(MODES) as Mode[]).map((m) => {
                    const Icon = ICONS[m];
                    const disabled = !ready || needsOnline(m);

                    return (
                        <button
                            key={m}
                            type={'button'}
                            disabled={disabled}
                            aria-pressed={mode === m}
                            title={why ?? (needsOnline(m) ? 'The player is not online' : undefined)}
                            onClick={() => setMode(mode === m ? null : m)}
                            className={classNames(
                                'inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-primary-600/30 disabled:cursor-not-allowed disabled:opacity-40',
                                mode === m
                                    ? MODES[m].danger
                                        ? 'border-red-500 bg-red-50 text-red-700'
                                        : 'border-primary-600 bg-primary-50 text-primary-700'
                                    : MODES[m].danger
                                    ? 'border-neutral-500 text-red-600 hover:border-red-300 hover:bg-red-50'
                                    : 'border-neutral-500 text-neutral-100 hover:bg-neutral-600'
                            )}
                        >
                            <Icon className={'mr-1.5 h-4 w-4'} />
                            {MODES[m].label}
                        </button>
                    );
                })}
                {done && (
                    <span role={'status'} className={'text-xs font-medium text-green-700'}>
                        {done}
                    </span>
                )}
            </div>
            {mode && (
                <form onSubmit={submit} className={'mt-3 flex flex-wrap items-center gap-2'}>
                    <input
                        ref={field}
                        value={text}
                        maxLength={MAX_TEXT}
                        placeholder={MODES[mode].placeholder}
                        aria-label={MODES[mode].placeholder}
                        onChange={(e) => setText(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setMode(null))}
                        className={
                            'min-w-[14rem] flex-1 rounded-lg border border-neutral-500 bg-white px-3 py-2 text-sm text-neutral-50 placeholder-neutral-400 focus:border-primary-600 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-primary-600/30'
                        }
                    />
                    <button
                        type={'submit'}
                        disabled={mode === 'whisper' && text.trim() === ''}
                        className={classNames(
                            'rounded-lg px-4 py-2 text-sm font-semibold text-snow disabled:cursor-not-allowed disabled:opacity-40',
                            MODES[mode].danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
                        )}
                    >
                        {MODES[mode].submit} {mode === 'whisper' ? '' : name}
                    </button>
                    <button
                        type={'button'}
                        onClick={() => setMode(null)}
                        className={'rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-600'}
                    >
                        Cancel
                    </button>
                </form>
            )}
        </div>
    );
};

import React, { useEffect, useMemo, useState } from 'react';
import { SearchIcon } from '@heroicons/react/solid';
import { Dialog } from '@/components/elements/dialog';
import Input from '@/components/elements/Input';
import Spinner from '@/components/elements/Spinner';
import Switch from '@/components/elements/Switch';
import { httpErrorToHuman } from '@/api/http';
import { Dimension, GAME_RULES_FILE, readDimensionFile, writeDimensionFile } from '@/lib/dimensions';
import { NbtFile } from '@/lib/nbt';
import { parseRuleNumber, readGameRules, Rule, RULE_GROUPS, setGameRule } from '@/lib/gameRules';

interface Props {
    dimension: Dimension | null;
    uuid: string;
    offline: boolean;
    onClose: () => void;
    // Called with a message once the rules are saved.
    onSaved: (message: string) => void;
}

/** The game rules of one dimension, edited in its game_rules.dat so the server does not have to be running. */
export default ({ dimension, uuid, offline, onClose, onSaved }: Props) => {
    const [file, setFile] = useState<NbtFile | null>(null);
    // What is in the file on the server, to tell what was changed.
    const [original, setOriginal] = useState<NbtFile | null>(null);
    const [missing, setMissing] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    // What is typed in the number fields, which can be wrong for a moment.
    const [typed, setTyped] = useState<Record<string, string>>({});

    useEffect(() => {
        setFile(null);
        setOriginal(null);
        setMissing(false);
        setError('');
        setSearch('');
        setTyped({});
        if (!dimension) return;

        let cancelled = false;
        readDimensionFile(uuid, dimension, GAME_RULES_FILE)
            .then((loaded) => {
                if (cancelled) return;
                if (!loaded) return setMissing(true);
                setFile(loaded);
                setOriginal(loaded);
            })
            .catch(
                (e) =>
                    !cancelled && setError(e?.response ? httpErrorToHuman(e) : e.message || 'Could not read the rules.')
            );

        return () => {
            cancelled = true;
        };
    }, [dimension?.path, uuid]);

    const rules = useMemo(() => (file ? readGameRules(file).rules : []), [file]);
    const before = useMemo(() => {
        const map = new Map<string, boolean | number>();
        (original ? readGameRules(original).rules : []).forEach((rule) => map.set(rule.key, rule.value));

        return map;
    }, [original]);
    const changed = rules.filter((rule) => before.get(rule.key) !== rule.value).length;
    const bad = Object.values(typed).some((text) => parseRuleNumber(text) === null);

    const set = (rule: Rule, value: boolean | number) => {
        if (!file) return;
        try {
            setFile(setGameRule(file, rule.key, value));
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const save = async () => {
        if (!dimension || !file || !offline || bad || !changed) return;
        setSaving(true);
        setError('');
        try {
            await writeDimensionFile(uuid, dimension, GAME_RULES_FILE, file);
            onSaved(`Game rules of ${dimension.label} saved. Start the server to use them.`);
            onClose();
        } catch (e) {
            setError((e as any)?.response ? httpErrorToHuman(e) : (e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const needle = search.trim().toLowerCase();
    const shown = rules.filter(
        (rule) => !needle || rule.label.toLowerCase().includes(needle) || rule.id.includes(needle.replace(/ /g, '_'))
    );

    return (
        <Dialog.Confirm
            open={!!dimension}
            onClose={() => !saving && onClose()}
            title={dimension ? `Game rules of ${dimension.label}` : undefined}
            confirm={saving ? 'Saving...' : changed ? `Save ${changed} change${changed === 1 ? '' : 's'}` : 'Save'}
            confirmVariant={'primary'}
            onConfirmed={save}
        >
            {!offline && (
                <p className={'mb-3 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800'}>
                    Stop the server to change these. While it runs it would write its own rules over the file, use the
                    /gamerule command instead.
                </p>
            )}
            {error && <p className={'mb-3 text-xs text-red-500'}>{error}</p>}
            {missing ? (
                <p className={'text-sm text-neutral-300'}>
                    This dimension has no game_rules.dat yet. The server writes it when it saves the world.
                </p>
            ) : !file && !error ? (
                <Spinner centered size={'base'} />
            ) : (
                file && (
                    <>
                        <div className={'relative mb-3'}>
                            <SearchIcon
                                className={
                                    'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400'
                                }
                            />
                            <Input
                                style={{ paddingLeft: '2.25rem' }}
                                aria-label={'Search game rules'}
                                placeholder={'Search game rules'}
                                value={search}
                                onChange={(e) => setSearch(e.currentTarget.value)}
                            />
                        </div>
                        <div className={'max-h-[55vh] overflow-y-auto pr-1'}>
                            {RULE_GROUPS.map((group) => {
                                const inGroup = shown.filter((rule) => rule.group === group);
                                if (!inGroup.length) return null;

                                return (
                                    <div key={group} className={'mb-4'}>
                                        <p
                                            className={
                                                'mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'
                                            }
                                        >
                                            {group}
                                        </p>
                                        <div className={'space-y-3'}>
                                            {inGroup.map((rule) => (
                                                <div
                                                    key={rule.key}
                                                    className={'flex items-center justify-between gap-4'}
                                                >
                                                    <div className={'min-w-0 flex-1'}>
                                                        <p className={'text-sm font-medium text-neutral-50'}>
                                                            {rule.label}
                                                            {before.get(rule.key) !== rule.value && (
                                                                <span
                                                                    className={
                                                                        'ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700'
                                                                    }
                                                                >
                                                                    Changed
                                                                </span>
                                                            )}
                                                        </p>
                                                        {rule.description && (
                                                            <p className={'text-xs text-neutral-400'}>
                                                                {rule.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {rule.kind === 'boolean' ? (
                                                        <Switch
                                                            key={`${rule.key}-${String(rule.value)}`}
                                                            name={rule.key}
                                                            defaultChecked={rule.value as boolean}
                                                            readOnly={!offline}
                                                            onChange={(e) => set(rule, e.currentTarget.checked)}
                                                        />
                                                    ) : (
                                                        <div className={'w-28 flex-shrink-0'}>
                                                            <Input
                                                                style={{ textAlign: 'right' }}
                                                                aria-label={rule.label}
                                                                inputMode={'numeric'}
                                                                disabled={!offline}
                                                                value={typed[rule.key] ?? String(rule.value)}
                                                                onChange={(e) => {
                                                                    const text = e.currentTarget.value;
                                                                    const number = parseRuleNumber(text);
                                                                    setTyped((t) => ({ ...t, [rule.key]: text }));
                                                                    if (number !== null) set(rule, number);
                                                                }}
                                                                onBlur={() =>
                                                                    setTyped((t) => {
                                                                        const next = { ...t };
                                                                        // A number that was not valid goes back to the last good one.
                                                                        if (
                                                                            parseRuleNumber(next[rule.key] ?? '') ===
                                                                            null
                                                                        )
                                                                            delete next[rule.key];
                                                                        return next;
                                                                    })
                                                                }
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {!shown.length && <p className={'text-sm text-neutral-400'}>No game rule matches that.</p>}
                        </div>
                    </>
                )
            )}
        </Dialog.Confirm>
    );
};

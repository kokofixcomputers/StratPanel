import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { ArrowLeftIcon, HeartIcon, RefreshIcon, XIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import { ModalMask } from '@/components/elements/Modal';
import { Button } from '@/components/elements/button/index';
import Spinner from '@/components/elements/Spinner';
import { PlayerHead } from '@/components/server/players/PlayerListCard';
import PlayerVitals from '@/components/server/players/PlayerVitals';
import InventoryBoard from '@/components/server/players/InventoryBoard';
import Adjuster from '@/components/server/players/Adjuster';
import PlayerModActions from '@/components/server/players/PlayerModActions';
import styles from '@/components/server/players/PlayerModal.module.css';
import useServerVersion from '@/components/server/content/useServerVersion';
import { usePermissions } from '@/plugins/usePermissions';
import { useBridgeStatus } from '@/lib/bridge';
import { EXPERIENCE_BAR_BACKGROUND, EXPERIENCE_BAR_PROGRESS } from '@/lib/hudIcons';
import {
    BoxWhere,
    PlayerCommand,
    playerCommandLine,
    prettyItem,
    textureVersion,
    useEnderChest,
    useInventory,
    usePlayerError,
    useShulkerBox,
} from '@/lib/inventory';
import { exactNumber } from '@/lib/statFormat';
import { GAME_MODES, useVitals } from '@/lib/vitals';
import '@/assets/fonts/monocraft.css';

/** How often the inventory is read again while the window is open. Every answer is a line in the server's log. */
const REFRESH_MS = 10000;

const px = (units: number) => `calc(${units}px * var(--s))`;

interface Props {
    name: string;
    uuid: string;
    online: boolean;
    onClose: () => void;
}

/**
 * Everything about one player in a window: health, hunger and experience as the game draws them, buttons to heal and feed,
 * and the inventory to look into, move around and delete from. It needs the Stratosphere plugin, which does the work.
 */
export default ({ name, uuid, online, onClose }: Props) => {
    const server = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const running = ServerContext.useStoreState((state) => state.status.value) === 'running';
    const [canControl] = usePermissions(['control.console']);
    const bridge = useBridgeStatus(server);
    const version = textureVersion(useServerVersion());
    const vitals = useVitals(server)[name];
    const inventory = useInventory(server, name);
    const enderChest = useEnderChest(server, name);
    const lastBox = useShulkerBox(server, name);
    const error = usePlayerError(server);
    const opened = useRef(Date.now());
    const [notice, setNotice] = useState<string | null>(null);
    // Which of the two the board shows.
    const [tab, setTab] = useState<'inventory' | 'ender'>('inventory');
    // The shulker box that is open instead of the board, by where it lies and its slot.
    const [box, setBox] = useState<{ where: BoxWhere; slot: number } | null>(null);

    const capable = bridge.state === 'connected' && (bridge.protocol || 1) >= 4;
    // The ender chest came with a later version of the plugin.
    const canEnder = capable && (bridge.protocol || 1) >= 5;
    // Shulker boxes can be opened with a still later version of the plugin.
    const canShulker = capable && (bridge.protocol || 1) >= 9;
    const items = tab === 'ender' ? enderChest : inventory;
    const live = online && running && capable;
    // What the plugin last said about a box, when it is the one that is open (an older answer is another box).
    const inside = box && lastBox && lastBox.where === box.where && lastBox.box === box.slot ? lastBox : null;

    const send = (command: PlayerCommand) => {
        const line = playerCommandLine(command);
        if (line && instance) instance.send('send command', line);
    };

    // Look into the inventory when the window opens, and again every few seconds.
    useEffect(() => {
        if (!live || !instance) return;
        const ask = () => {
            if (document.hidden) return;
            if (box) send({ action: 'shulker', name, where: box.where, slot: box.slot });
            else send({ action: tab === 'ender' ? 'ender' : 'inventory', name });
        };
        ask();
        const timer = setInterval(ask, REFRESH_MS);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [live, instance, name, tab, box]);

    useEffect(() => {
        // Escape first leaves the shulker box, then the window.
        const listener = (e: KeyboardEvent) => e.key === 'Escape' && (box ? setBox(null) : onClose());
        window.addEventListener('keydown', listener);

        return () => window.removeEventListener('keydown', listener);
    }, [onClose, box]);

    // A refusal of the plugin, such as an item that does not fit an armor slot, for a few seconds.
    useEffect(() => {
        if (!error || error.name !== name || error.at < opened.current) return;
        setNotice(error.error);
        // The box is not where it was (it was moved or taken since): back to the list it was in.
        if (error.error === 'That is not a shulker box.') setBox(null);
        const timer = setTimeout(() => setNotice(null), 6000);

        return () => clearTimeout(timer);
    }, [error, name]);

    const exp = vitals ? Math.round(vitals.exp * 100) : 0;
    const actionsDisabled = !live || !canControl;
    // Changing the numbers came with a later version of the plugin.
    const canAdjust = !actionsDisabled && (bridge.protocol || 1) >= 6;
    // The game mode is sent with a still later version, an older plugin shows no mode.
    const canMode = actionsDisabled === false && (bridge.protocol || 1) >= 7;
    const adjustReason = !canControl
        ? 'You are not allowed to use the console of this server'
        : 'Update the Stratosphere plugin to change these';

    return (
        <ModalMask onMouseDown={(e) => e.target === e.currentTarget && onClose()} onClick={(e) => e.stopPropagation()}>
            <div
                className={classNames(
                    styles.root,
                    'relative m-auto w-full max-w-[1260px] rounded-2xl border border-neutral-500 bg-white p-5 shadow-xl sm:p-6'
                )}
                role={'dialog'}
                aria-label={`Player ${name}`}
                style={{ maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}
            >
                <button
                    type={'button'}
                    onClick={onClose}
                    aria-label={'Close'}
                    className={
                        'absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-neutral-500 bg-white text-neutral-400 hover:bg-neutral-600 hover:text-neutral-50'
                    }
                >
                    <XIcon className={'h-4 w-4'} />
                </button>

                <div className={'mb-5 flex items-center gap-4 pr-12'}>
                    <PlayerHead uuid={uuid} name={name} size={48} />
                    <div className={'min-w-0'}>
                        <p className={'truncate text-xl font-bold text-neutral-50'}>{name}</p>
                        <p className={'flex items-center gap-2 text-xs text-neutral-400'}>
                            <span
                                className={classNames(
                                    'h-2.5 w-2.5 rounded-full',
                                    online ? 'bg-green-500' : 'bg-neutral-400'
                                )}
                            />
                            {online ? 'Online' : 'Offline'}
                            <span className={'truncate font-mono'}>{uuid}</span>
                        </p>
                    </div>
                </div>

                <PlayerModActions
                    name={name}
                    online={online}
                    allowed={canControl}
                    running={running && !!instance}
                    send={(command) => instance?.send('send command', command)}
                />

                {!online ? (
                    <p className={'rounded-lg bg-neutral-600 px-3 py-3 text-sm text-neutral-300'}>
                        Health, hunger and the inventory are shown while the player is online.
                    </p>
                ) : !capable ? (
                    <p className={'rounded-lg bg-yellow-50 px-3 py-3 text-sm text-yellow-800'}>
                        {bridge.state === 'connected'
                            ? 'The Stratosphere plugin on this server is too old for this. Update it from the status button on the console page, then restart the server.'
                            : 'This needs the Stratosphere plugin on the server, it is not answering.'}
                    </p>
                ) : (
                    <div className={'flex flex-col gap-6 lg:flex-row lg:items-start'}>
                        <div className={'min-w-0 space-y-5'}>
                            <section>
                                <p className={'mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'}>
                                    Health and hunger
                                </p>
                                {vitals ? (
                                    <div className={'inline-block'}>
                                        <PlayerVitals vitals={vitals} inherit />
                                        {/* The experience bar and the level, as the game shows them over the hotbar. */}
                                        <div className={'mt-2'} style={{ width: px(182) }}>
                                            <p
                                                className={classNames(styles.mc, 'text-center')}
                                                style={{ fontSize: px(8), color: '#80ff20', height: px(10) }}
                                            >
                                                {vitals.level > 0 ? vitals.level : ''}
                                            </p>
                                            <div
                                                className={classNames(styles.pixel, 'relative')}
                                                style={{
                                                    height: px(5),
                                                    backgroundImage: `url(${EXPERIENCE_BAR_BACKGROUND})`,
                                                    backgroundSize: '100% 100%',
                                                }}
                                                role={'img'}
                                                aria-label={`Level ${vitals.level}, ${exp} percent to the next`}
                                            >
                                                <div
                                                    className={'absolute left-0 top-0 h-full overflow-hidden'}
                                                    style={{ width: `${vitals.exp * 100}%` }}
                                                >
                                                    <img
                                                        src={EXPERIENCE_BAR_PROGRESS}
                                                        alt={''}
                                                        className={styles.pixel}
                                                        style={{ width: px(182), maxWidth: 'none', height: px(5) }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <Spinner size={'small'} />
                                )}
                            </section>

                            {vitals && (
                                <dl className={'grid grid-cols-2 gap-x-6 gap-y-3 text-sm'}>
                                    <div>
                                        <dt className={'text-xs text-neutral-400'}>Health</dt>
                                        <dd className={'font-semibold text-neutral-50'}>
                                            {exactNumber(vitals.health, 1)} / {exactNumber(vitals.maxHealth, 0)}
                                            {vitals.absorption > 0 && (
                                                <span className={'ml-1 text-yellow-600'}>
                                                    +{exactNumber(vitals.absorption, 1)}
                                                </span>
                                            )}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className={'text-xs text-neutral-400'}>Hunger</dt>
                                        <dd className={'font-semibold text-neutral-50'}>{vitals.food} / 20</dd>
                                    </div>
                                    <div>
                                        <dt className={'text-xs text-neutral-400'}>Saturation</dt>
                                        <dd className={'font-semibold text-neutral-50'}>
                                            {exactNumber(vitals.saturation, 2)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className={'text-xs text-neutral-400'}>Experience</dt>
                                        <dd className={'font-semibold text-neutral-50'}>
                                            Level {vitals.level}, {exp}% to the next
                                        </dd>
                                    </div>
                                </dl>
                            )}

                            {vitals && (
                                <section>
                                    <p
                                        className={
                                            'mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400'
                                        }
                                    >
                                        Game mode
                                    </p>
                                    <div className={'flex flex-wrap gap-2'} role={'group'} aria-label={'Game mode'}>
                                        {GAME_MODES.map((mode) => {
                                            const current = vitals.gameMode === mode.id;

                                            return (
                                                <button
                                                    key={mode.id}
                                                    type={'button'}
                                                    aria-pressed={current}
                                                    disabled={!canMode || current}
                                                    title={canMode ? undefined : adjustReason}
                                                    onClick={() => send({ action: 'gamemode', name, mode: mode.id })}
                                                    className={classNames(
                                                        'rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors duration-150',
                                                        current
                                                            ? 'border-primary-600 bg-primary-600 text-snow disabled:opacity-100'
                                                            : 'border-neutral-500 bg-white text-neutral-200 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50'
                                                    )}
                                                >
                                                    {mode.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {vitals && (
                                <section className={'space-y-3'}>
                                    <p className={'text-xs font-semibold uppercase tracking-wide text-neutral-400'}>
                                        Adjust
                                    </p>
                                    <Adjuster
                                        label={'Health'}
                                        hint={'One heart at a time, never below half a heart'}
                                        disabled={!canAdjust}
                                        disabledReason={adjustReason}
                                        steps={[
                                            { delta: -2, enabled: vitals.health > 1 },
                                            { delta: 2, enabled: vitals.health < vitals.maxHealth },
                                        ]}
                                        onStep={(delta) => send({ action: 'health', name, delta })}
                                    />
                                    <Adjuster
                                        label={'Hunger'}
                                        hint={'One drumstick at a time'}
                                        disabled={!canAdjust}
                                        disabledReason={adjustReason}
                                        steps={[
                                            { delta: -2, enabled: vitals.food > 0 },
                                            { delta: 2, enabled: vitals.food < 20 },
                                        ]}
                                        onStep={(delta) => send({ action: 'hunger', name, delta })}
                                    />
                                    <Adjuster
                                        label={'Levels'}
                                        hint={`Level ${vitals.level}, the progress to the next one stays`}
                                        disabled={!canAdjust}
                                        disabledReason={adjustReason}
                                        steps={[
                                            { delta: -5, enabled: vitals.level > 0 },
                                            { delta: -1, enabled: vitals.level > 0 },
                                            { delta: 1, enabled: true },
                                            { delta: 5, enabled: true },
                                        ]}
                                        onStep={(delta) => send({ action: 'levels', name, delta })}
                                    />
                                </section>
                            )}

                            <div className={'flex flex-wrap gap-2'}>
                                <span
                                    title={
                                        canControl ? undefined : 'You are not allowed to use the console of this server'
                                    }
                                >
                                    <Button disabled={actionsDisabled} onClick={() => send({ action: 'heal', name })}>
                                        <HeartIcon className={'mr-2 h-4 w-4'} />
                                        Heal
                                    </Button>
                                </span>
                                <span
                                    title={
                                        canControl ? undefined : 'You are not allowed to use the console of this server'
                                    }
                                >
                                    <Button.Text
                                        disabled={actionsDisabled}
                                        onClick={() => send({ action: 'feed', name })}
                                    >
                                        Feed
                                    </Button.Text>
                                </span>
                            </div>
                            <p className={'text-xs text-neutral-400'}>
                                Heal fills the health bar and Feed the hunger bar and the saturation.
                            </p>
                        </div>

                        <div className={'min-w-0 flex-shrink-0'}>
                            <div className={'mb-2 flex items-center justify-between gap-3'}>
                                {box ? (
                                    <button
                                        type={'button'}
                                        onClick={() => setBox(null)}
                                        className={
                                            'inline-flex items-center rounded-full border border-neutral-500 bg-white px-3 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-600'
                                        }
                                    >
                                        <ArrowLeftIcon className={'mr-1 h-3.5 w-3.5'} />
                                        Back to {box.where === 'ender' ? 'the ender chest' : 'the inventory'}
                                    </button>
                                ) : (
                                    <div className={'flex gap-2'} role={'tablist'}>
                                        {(
                                            [
                                                ['inventory', 'Inventory'],
                                                ['ender', 'Ender chest'],
                                            ] as const
                                        ).map(([id, label]) => (
                                            <button
                                                key={id}
                                                type={'button'}
                                                role={'tab'}
                                                aria-selected={tab === id}
                                                disabled={id === 'ender' && !canEnder}
                                                title={
                                                    id === 'ender' && !canEnder
                                                        ? 'Update the Stratosphere plugin to see the ender chest'
                                                        : undefined
                                                }
                                                onClick={() => setTab(id)}
                                                className={classNames(
                                                    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                                                    tab === id
                                                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                                                        : 'border-neutral-500 bg-white text-neutral-300 hover:bg-neutral-600'
                                                )}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <button
                                    type={'button'}
                                    onClick={() =>
                                        send(
                                            box
                                                ? { action: 'shulker', name, where: box.where, slot: box.slot }
                                                : { action: tab === 'ender' ? 'ender' : 'inventory', name }
                                        )
                                    }
                                    className={'flex items-center text-xs text-neutral-300 hover:text-neutral-50'}
                                >
                                    <RefreshIcon className={'mr-1 h-3.5 w-3.5'} />
                                    Refresh
                                </button>
                            </div>
                            {notice && (
                                <p className={'mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700'}>{notice}</p>
                            )}
                            {box ? (
                                inside ? (
                                    <InventoryBoard
                                        key={`box-${box.where}-${box.slot}`}
                                        layout={'shulker'}
                                        title={prettyItem(inside.boxId)}
                                        items={inside.items}
                                        version={version}
                                        uuid={uuid}
                                        name={name}
                                        canEdit={canControl}
                                        onSwap={(from, to) =>
                                            send({
                                                action: 'shulkerswap',
                                                name,
                                                where: box.where,
                                                slot: box.slot,
                                                from,
                                                to,
                                            })
                                        }
                                        onDelete={(inner) =>
                                            send({
                                                action: 'shulkerdelete',
                                                name,
                                                where: box.where,
                                                slot: box.slot,
                                                inner,
                                            })
                                        }
                                    />
                                ) : (
                                    <Spinner size={'small'} />
                                )
                            ) : items ? (
                                <InventoryBoard
                                    key={tab}
                                    layout={tab}
                                    items={items}
                                    version={version}
                                    uuid={uuid}
                                    name={name}
                                    canEdit={canControl}
                                    onSwap={(from, to) =>
                                        send({ action: tab === 'ender' ? 'enderswap' : 'swap', name, from, to })
                                    }
                                    onDelete={(slot) =>
                                        send({ action: tab === 'ender' ? 'enderdelete' : 'delete', name, slot })
                                    }
                                    onOpenBox={
                                        canShulker && live
                                            ? (slot) => setBox({ where: tab === 'ender' ? 'ender' : 'inv', slot })
                                            : undefined
                                    }
                                />
                            ) : (
                                <Spinner size={'small'} />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </ModalMask>
    );
};

import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import { PlayerHead } from '@/components/server/players/PlayerListCard';
import ItemIcon from '@/components/server/players/ItemIcon';
import styles from '@/components/server/players/PlayerModal.module.css';
import { ENDER_CHEST_GUI, INVENTORY_GUI } from '@/lib/hudIcons';
import {
    alwaysShimmers,
    BOOTS,
    CHESTPLATE,
    durabilityColor,
    durabilityLeft,
    ENDER_POSITIONS,
    enchantmentLine,
    HELMET,
    InventoryItem,
    isShulkerBox,
    LEGGINGS,
    OFF_HAND,
    prettyItem,
    SHULKER_POSITIONS,
    SLOT_POSITIONS,
} from '@/lib/inventory';

const px = (units: number) => `calc(${units}px * var(--s))`;
// Text is not scaled like the pictures, it has to stay readable at the smallest size.
const text = (units: number) => `max(11px, calc(${units}px * var(--s)))`;

const SLOT_NAMES: Record<number, string> = {
    [HELMET]: 'Helmet',
    [CHESTPLATE]: 'Chestplate',
    [LEGGINGS]: 'Leggings',
    [BOOTS]: 'Boots',
    [OFF_HAND]: 'Off hand',
};

const slotName = (slot: number, layout: Layout): string =>
    layout === 'ender'
        ? `Ender chest ${slot + 1}`
        : layout === 'shulker'
        ? `Shulker box ${slot + 1}`
        : SLOT_NAMES[slot] || (slot < 9 ? `Hotbar ${slot + 1}` : `Inventory ${slot - 8}`);

export type Layout = 'inventory' | 'ender' | 'shulker';

// The two screens: the picture, how big it is, where the items are and where the details of the chosen item go.
const LAYOUTS = {
    inventory: { image: INVENTORY_GUI, height: 166, positions: SLOT_POSITIONS, info: { x: 97, y: 17, w: 75, h: 37 } },
    ender: { image: ENDER_CHEST_GUI, height: 118, positions: ENDER_POSITIONS, info: { x: 8, y: 76, w: 160, h: 32 } },
    // The inside of a shulker box is the same screen as the ender chest.
    shulker: {
        image: ENDER_CHEST_GUI,
        height: 118,
        positions: SHULKER_POSITIONS,
        info: { x: 8, y: 76, w: 160, h: 32 },
    },
} as const;

/** The same items with two slots exchanged, shown at once while the plugin does it and answers with the real inventory. */
const exchanged = (items: InventoryItem[], from: number, to: number): InventoryItem[] => {
    const a = items.find((i) => i.slot === from);
    const b = items.find((i) => i.slot === to);
    const rest = items.filter((i) => i.slot !== from && i.slot !== to);

    return [...rest, ...(a ? [{ ...a, slot: to }] : []), ...(b ? [{ ...b, slot: from }] : [])];
};

interface Props {
    layout?: Layout;
    // The title of a shulker box screen, such as "Red Shulker Box".
    title?: string;
    items: InventoryItem[];
    version: string;
    uuid: string;
    name: string;
    // Whether the person may change the inventory.
    canEdit: boolean;
    onSwap: (from: number, to: number) => void;
    onDelete: (slot: number) => void;
    // When given, a double click on a shulker box (or its Open button) calls this with the slot of the box.
    onOpenBox?: (slot: number) => void;
}

/**
 * The inventory screen of the game with the items of a player in it. Items are moved by dragging them, or by clicking one
 * and then the slot it is to go to, and deleted from the panel in the place of the crafting grid. The picture is the one of the
 * game with the player and the crafting grid taken out, the head of the player is where the player was.
 */
export default ({
    layout = 'inventory',
    title,
    items,
    version,
    uuid,
    name,
    canEdit,
    onSwap,
    onDelete,
    onOpenBox,
}: Props) => {
    const screen = LAYOUTS[layout];
    const [local, setLocal] = useState<InventoryItem[] | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const [confirming, setConfirming] = useState(false);

    // The real inventory has arrived, so the one that was guessed is not needed any more.
    useEffect(() => setLocal(null), [items]);
    useEffect(() => setConfirming(false), [selected]);

    const view = local ?? items;
    const at = (slot: number) => view.find((item) => item.slot === slot);
    const current = selected !== null ? at(selected) : undefined;

    const move = (from: number, to: number) => {
        if (!canEdit || from === to) return;
        setLocal(exchanged(view, from, to));
        // Like putting an item down in the game: nothing is picked up any more.
        setSelected(null);
        onSwap(from, to);
    };

    const tooltip = (item: InventoryItem) => (
        <div className={'space-y-0.5'}>
            <div>{item.name || prettyItem(item.id)}</div>
            {item.name && <div className={'font-normal text-slate-300'}>{prettyItem(item.id)}</div>}
            {item.enchants &&
                Object.entries(item.enchants).map(([id, level]) => (
                    <div key={id} className={'font-normal text-indigo-300'}>
                        {enchantmentLine(id, level)}
                    </div>
                ))}
            {item.trim && (
                <div className={'font-normal text-slate-300'}>
                    <div className={'text-slate-400'}>Upgrade:</div>
                    <div className={'pl-1'}>{prettyItem(item.trim.pattern)} Armor Trim</div>
                    <div className={'pl-1'}>{prettyItem(item.trim.material)} Material</div>
                </div>
            )}
            {item.damage !== undefined && item.maxDamage !== undefined && (
                <div className={'font-normal text-slate-300'}>
                    Durability {item.maxDamage - item.damage} / {item.maxDamage}
                </div>
            )}
            <div className={'font-normal text-slate-400'}>{slotName(item.slot, layout)}</div>
            {onOpenBox && isShulkerBox(item.id) && (
                <div className={'font-normal text-sky-300'}>Double click to look inside</div>
            )}
        </div>
    );

    return (
        <div
            className={classNames(styles.pixel, 'relative flex-shrink-0 select-none')}
            style={{
                width: px(176),
                height: px(screen.height),
                backgroundImage: `url(${screen.image})`,
                backgroundSize: '100% 100%',
            }}
        >
            {layout === 'inventory' ? (
                <div className={'absolute'} style={{ left: px(30), top: px(14), width: px(40), height: px(40) }}>
                    <PlayerHead uuid={uuid} name={name} fill />
                </div>
            ) : (
                <p
                    className={'absolute'}
                    style={{
                        left: px(8),
                        top: px(5),
                        fontFamily: 'Monocraft, monospace',
                        fontSize: px(8),
                        color: '#404040',
                        lineHeight: 1,
                    }}
                >
                    {layout === 'shulker' ? title || 'Shulker Box' : 'Ender Chest'}
                </p>
            )}

            {screen.positions.map(({ slot, x, y }) => {
                const item = at(slot);
                const left = item ? durabilityLeft(item) : undefined;
                const body = (
                    <div
                        role={'button'}
                        tabIndex={0}
                        aria-label={
                            item
                                ? `${item.name || prettyItem(item.id)}, ${slotName(slot, layout)}`
                                : slotName(slot, layout)
                        }
                        className={classNames(styles.slot, {
                            [styles.slotSelected]: selected === slot,
                            [styles.slotTarget]: over === slot && selected !== slot,
                        })}
                        style={{ left: px(x), top: px(y) }}
                        draggable={!!item && canEdit}
                        onClick={() => {
                            if (selected !== null && selected !== slot && canEdit) return move(selected, slot);
                            setSelected(selected === slot ? null : slot);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.currentTarget.click();
                            }
                        }}
                        onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(slot));
                            e.dataTransfer.effectAllowed = 'move';
                            setSelected(slot);
                        }}
                        onDragOver={(e) => {
                            if (!canEdit) return;
                            e.preventDefault();
                            setOver(slot);
                        }}
                        onDragLeave={() => setOver((o) => (o === slot ? null : o))}
                        onDrop={(e) => {
                            e.preventDefault();
                            setOver(null);
                            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                            if (!isNaN(from)) move(from, slot);
                        }}
                        onDragEnd={() => setOver(null)}
                        onDoubleClick={() => {
                            if (item && onOpenBox && isShulkerBox(item.id)) onOpenBox(slot);
                        }}
                    >
                        {item && (
                            <>
                                <ItemIcon id={item.id} version={version} trim={item.trim} />
                                {(item.enchants || alwaysShimmers(item.id)) && <span className={styles.glint} />}
                                {left !== undefined && left < 1 && (
                                    <span
                                        className={'absolute'}
                                        style={{
                                            left: px(2),
                                            bottom: px(1),
                                            width: px(13),
                                            height: px(2),
                                            background: '#000',
                                        }}
                                    >
                                        <span
                                            className={'block h-full'}
                                            style={{
                                                width: `${Math.max(1, Math.round(left * 13)) * (100 / 13)}%`,
                                                background: durabilityColor(left),
                                            }}
                                        />
                                    </span>
                                )}
                                {item.count > 1 && (
                                    <span
                                        className={classNames(styles.mc, 'absolute text-snow')}
                                        style={{ right: 0, bottom: 0, fontSize: px(8) }}
                                    >
                                        {item.count}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                );

                return item ? (
                    <Tooltip key={slot} placement={'top'} content={tooltip(item)}>
                        {body}
                    </Tooltip>
                ) : (
                    <React.Fragment key={slot}>{body}</React.Fragment>
                );
            })}

            {/* Where the crafting grid was: what is selected. */}
            <div
                className={'absolute flex flex-col justify-between text-neutral-100'}
                style={{
                    left: px(screen.info.x),
                    top: px(screen.info.y),
                    width: px(screen.info.w),
                    height: px(screen.info.h),
                    fontSize: text(5),
                }}
            >
                {current ? (
                    <>
                        <div className={'min-w-0'}>
                            <p className={'truncate font-semibold'} style={{ fontSize: text(6) }}>
                                {current.name || prettyItem(current.id)}
                            </p>
                            <p className={'truncate text-neutral-300'}>
                                {current.count > 1 ? `${current.count} items` : '1 item'} ·{' '}
                                {slotName(current.slot, layout)}
                            </p>
                        </div>
                        {onOpenBox && isShulkerBox(current.id) && !confirming && (
                            <button
                                type={'button'}
                                className={'self-start rounded bg-primary-100 px-2 py-0.5 font-medium text-primary-700'}
                                style={{ fontSize: text(5) }}
                                onClick={() => onOpenBox(current.slot)}
                            >
                                Open
                            </button>
                        )}
                        {canEdit &&
                            (confirming ? (
                                <div className={'flex items-center gap-1'}>
                                    <button
                                        type={'button'}
                                        className={'rounded bg-red-600 px-2 py-0.5 font-medium text-snow'}
                                        style={{ fontSize: text(5) }}
                                        onClick={() => {
                                            setLocal(view.filter((i) => i.slot !== current.slot));
                                            setConfirming(false);
                                            setSelected(null);
                                            onDelete(current.slot);
                                        }}
                                    >
                                        Yes, delete
                                    </button>
                                    <button
                                        type={'button'}
                                        className={'rounded bg-white/70 px-2 py-0.5'}
                                        style={{ fontSize: text(5) }}
                                        onClick={() => setConfirming(false)}
                                    >
                                        No
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type={'button'}
                                    className={'self-start rounded bg-red-100 px-2 py-0.5 font-medium text-red-700'}
                                    style={{ fontSize: text(5) }}
                                    onClick={() => setConfirming(true)}
                                >
                                    Delete {current.count > 1 ? 'stack' : 'item'}
                                </button>
                            ))}
                    </>
                ) : (
                    <p className={'text-neutral-300'}>
                        {canEdit
                            ? 'Drag an item, or click it and then a slot, to move it.'
                            : 'Hover an item to see what it is.'}
                    </p>
                )}
            </div>
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { BlockIcon, blockIcon } from '@/lib/blockIcon';
import { fallbackTextureVersion, itemTextureUrl } from '@/lib/inventory';

/**
 * The picture of an item as the game shows it. Items are their flat sprite. A block has no sprite, so it is drawn as the little
 * 3D block of the inventory (plants and torches flat), see lib/blockIcon.ts. An item that has neither shows the first letters
 * of its name, so a modded item is not an empty hole.
 */
export default ({ id, version: wanted, className }: { id: string; version: string; className?: string }) => {
    // The pack of the newest version comes from Mojang when the tools are installed. When it is not there the older one is used.
    const [older, setOlder] = useState(false);
    const version = (older && fallbackTextureVersion(wanted)) || wanted;
    // item: try the sprite, block: the item has none, so it is drawn, none: nothing is known about it.
    const [stage, setStage] = useState<'item' | 'block' | 'none'>('item');
    const [icon, setIcon] = useState<BlockIcon | null>(null);

    useEffect(() => {
        setOlder(false);
        setStage('item');
        setIcon(null);
    }, [id, wanted]);

    useEffect(() => {
        setStage('item');
        setIcon(null);
    }, [older]);

    // Nothing is known about it in this pack, try the older one before giving up.
    useEffect(() => {
        if (stage === 'none' && !older && fallbackTextureVersion(wanted)) setOlder(true);
    }, [stage, older, wanted]);

    useEffect(() => {
        if (stage !== 'block') return;
        let cancelled = false;
        blockIcon(version, id).then((result) => {
            if (cancelled) return;
            if (result) setIcon(result);
            else setStage('none');
        });

        return () => {
            cancelled = true;
        };
    }, [stage, id, version]);

    if (stage === 'none' && (older || !fallbackTextureVersion(wanted))) {
        return (
            <span
                className={className}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.6em',
                    fontWeight: 700,
                    color: '#555',
                    textTransform: 'uppercase',
                }}
            >
                {id.replace(/^[^:]*:/, '').slice(0, 2)}
            </span>
        );
    }

    // Still being drawn, which is a moment for a block that was not seen before. Also the moment before the older pack is tried.
    if ((stage === 'block' && !icon) || stage === 'none') return null;

    return (
        <img
            key={stage === 'item' ? 'item' : icon!.url}
            src={stage === 'item' ? itemTextureUrl(version, id) : icon!.url}
            alt={''}
            draggable={false}
            className={className}
            style={{
                // The sprites are 16 pixels and stay sharp, the 3D blocks are drawn bigger and shown smaller.
                imageRendering: stage === 'item' || icon?.flat ? 'pixelated' : 'auto',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
            }}
            onError={() => stage === 'item' && setStage('block')}
        />
    );
};

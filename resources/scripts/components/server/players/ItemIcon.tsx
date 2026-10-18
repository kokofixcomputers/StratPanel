import React, { useEffect, useState } from 'react';
import { BlockIcon, blockIcon } from '@/lib/blockIcon';
import { fallbackTextureVersion, itemTextureUrl } from '@/lib/inventory';
import { trimOverlay, trimPaletteName, trimPieceOf } from '@/lib/trims';

/**
 * The picture of an item as the game shows it. Items are their flat sprite. A block has no sprite, so it is drawn as the little
 * 3D block of the inventory (plants and torches flat), see lib/blockIcon.ts. An item that has neither shows the first letters
 * of its name, so a modded item is not an empty hole.
 */
export default ({
    id,
    version: wanted,
    className,
    trim,
}: {
    id: string;
    version: string;
    className?: string;
    // The trim of a piece of armor, drawn over its icon in the colours of the material.
    trim?: { material: string; pattern: string };
}) => {
    // The pack of the newest version comes from Mojang when the tools are installed. When it is not there the older one is used.
    const [older, setOlder] = useState(false);
    const version = (older && fallbackTextureVersion(wanted)) || wanted;
    // item: try the sprite, block: the item has none, so it is drawn, none: nothing is known about it.
    const [stage, setStage] = useState<'item' | 'block' | 'none'>('item');
    const [icon, setIcon] = useState<BlockIcon | null>(null);
    // The layer of the trim, ready to lay over the icon, null while it is made or when there is none.
    const [overlay, setOverlay] = useState<string | null>(null);

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

    // The layer of the armor trim from the pack of the version, or from the older pack when the newer one has none.
    const piece = trim ? trimPieceOf(id) : null;
    const palette = trim && piece ? trimPaletteName(id, trim.material) : null;
    useEffect(() => {
        setOverlay(null);
        if (!piece || !palette) return;
        let cancelled = false;
        trimOverlay(version, piece, palette)
            .then((url) => {
                const older = fallbackTextureVersion(wanted);

                return url || (older && older !== version ? trimOverlay(older, piece, palette) : null);
            })
            .then((url) => !cancelled && setOverlay(url));

        return () => {
            cancelled = true;
        };
    }, [piece, palette, version, wanted]);

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

    const picture = (
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

    // A piece of armor with a trim: the icon with the layer of the trim over it, like in the game.
    if (overlay && stage === 'item') {
        return (
            <span
                className={className}
                style={{ position: 'relative', display: 'block', width: '100%', height: '100%' }}
            >
                {picture}
                <img
                    src={overlay}
                    alt={''}
                    aria-hidden
                    draggable={false}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        imageRendering: 'pixelated',
                        pointerEvents: 'none',
                    }}
                />
            </span>
        );
    }

    return picture;
};

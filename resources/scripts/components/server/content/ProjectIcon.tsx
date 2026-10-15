import React from 'react';
import { PuzzleIcon } from '@heroicons/react/solid';

/** The picture of a project, or a puzzle piece for the many that have none. Size is in pixels. */
export default ({ src, size = 64 }: { src: string | null | undefined; size?: number }) => (
    <div
        className={'flex flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-600'}
        style={{ width: size, height: size }}
    >
        {src ? (
            <img
                src={src}
                alt={''}
                loading={'lazy'}
                referrerPolicy={'no-referrer'}
                className={'h-full w-full object-cover'}
            />
        ) : (
            <PuzzleIcon className={'text-neutral-400'} style={{ width: size / 2.5, height: size / 2.5 }} />
        )}
    </div>
);

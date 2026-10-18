import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from '@heroicons/react/solid';
import { GalleryImage } from '@/lib/modrinth';

/** The pictures of a project as a grid, and a larger view with the title and description of each one. */
export default ({ images }: { images: GalleryImage[] }) => {
    // Featured pictures first, then the order the author gave them.
    const sorted = [...images].sort((a, b) => Number(b.featured) - Number(a.featured) || a.ordering - b.ordering);
    const [open, setOpen] = useState<number | null>(null);

    const step = useCallback(
        (by: number) =>
            setOpen((current) => (current === null ? null : (current + by + sorted.length) % sorted.length)),
        [sorted.length]
    );

    useEffect(() => {
        if (open === null) return;

        const listener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(null);
            else if (e.key === 'ArrowRight') step(1);
            else if (e.key === 'ArrowLeft') step(-1);
        };
        document.addEventListener('keydown', listener);

        return () => document.removeEventListener('keydown', listener);
    }, [open, step]);

    if (!sorted.length) {
        return <p className={'text-sm text-neutral-300'}>This project has no pictures.</p>;
    }

    const current = open === null ? null : sorted[open];

    return (
        <>
            <div className={'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                {sorted.map((image, index) => (
                    <button
                        key={image.url}
                        type={'button'}
                        onClick={() => setOpen(index)}
                        className={
                            'group overflow-hidden rounded-xl border border-neutral-500 bg-white text-left shadow-md transition-shadow duration-150 hover:shadow-lg'
                        }
                    >
                        <div className={'aspect-video w-full overflow-hidden bg-neutral-600'}>
                            <img
                                src={image.url}
                                alt={image.title || ''}
                                loading={'lazy'}
                                referrerPolicy={'no-referrer'}
                                className={
                                    'h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
                                }
                            />
                        </div>
                        {(image.title || image.description) && (
                            <div className={'p-3'}>
                                {image.title && (
                                    <p className={'truncate text-sm font-semibold text-neutral-50'}>{image.title}</p>
                                )}
                                {image.description && (
                                    <p className={'mt-0.5 line-clamp-2 text-xs text-neutral-300'}>
                                        {image.description}
                                    </p>
                                )}
                            </div>
                        )}
                    </button>
                ))}
            </div>
            {current &&
                createPortal(
                    <div
                        role={'dialog'}
                        aria-modal
                        className={'fixed inset-0 flex flex-col items-center justify-center p-4'}
                        style={{ zIndex: 1000, background: 'rgba(15, 23, 42, 0.88)' }}
                        onClick={() => setOpen(null)}
                    >
                        <button
                            type={'button'}
                            aria-label={'Close'}
                            onClick={() => setOpen(null)}
                            className={
                                'absolute right-4 top-4 rounded-full bg-white bg-opacity-10 p-2 text-snow hover:bg-opacity-20'
                            }
                        >
                            <XIcon className={'h-6 w-6'} />
                        </button>
                        {sorted.length > 1 && (
                            <>
                                <button
                                    type={'button'}
                                    aria-label={'Previous picture'}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        step(-1);
                                    }}
                                    className={
                                        'absolute left-3 rounded-full bg-white bg-opacity-10 p-2 text-snow hover:bg-opacity-20'
                                    }
                                >
                                    <ChevronLeftIcon className={'h-7 w-7'} />
                                </button>
                                <button
                                    type={'button'}
                                    aria-label={'Next picture'}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        step(1);
                                    }}
                                    className={
                                        'absolute right-3 rounded-full bg-white bg-opacity-10 p-2 text-snow hover:bg-opacity-20'
                                    }
                                >
                                    <ChevronRightIcon className={'h-7 w-7'} />
                                </button>
                            </>
                        )}
                        <img
                            src={current.raw_url || current.url}
                            alt={current.title || ''}
                            referrerPolicy={'no-referrer'}
                            className={'max-h-[78vh] max-w-full rounded-lg object-contain shadow-xl'}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div className={'mt-3 max-w-2xl text-center text-snow'} onClick={(e) => e.stopPropagation()}>
                            {current.title && <p className={'text-base font-semibold'}>{current.title}</p>}
                            {current.description && <p className={'mt-1 text-sm opacity-80'}>{current.description}</p>}
                            <p className={'mt-1 text-xs opacity-60'}>
                                {(open as number) + 1} / {sorted.length}
                            </p>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
};

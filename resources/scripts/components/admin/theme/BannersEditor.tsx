import React, { useRef } from 'react';
import { TrashIcon, UploadIcon } from '@heroicons/react/solid';
import { Row, Slider } from '@/components/admin/theme/controls';
import { SOFTWARE } from '@/lib/mcjars';
import { Banners } from '@/lib/themeConfig';

export interface EggInfo {
    id: number;
    name: string;
    nest: string | null;
}

const BannerPick = ({
    label,
    hint,
    value,
    busy,
    onUpload,
    onChange,
}: {
    label: string;
    hint?: string | null;
    value: string | undefined;
    busy: boolean;
    onUpload: (picture: File) => void;
    onChange: (value: string | null) => void;
}) => {
    const file = useRef<HTMLInputElement>(null);

    return (
        <li className={'flex items-center gap-2 border-b border-neutral-500 px-2 py-2 last:border-b-0'}>
            <span
                className={
                    'h-9 w-16 flex-shrink-0 rounded-md border border-neutral-500 bg-neutral-600 bg-cover bg-center'
                }
                style={value ? { backgroundImage: `url("${value}")` } : undefined}
            />
            <span className={'min-w-0 flex-1'}>
                <span className={'block truncate text-sm text-neutral-100'}>{label}</span>
                {hint && <span className={'block truncate text-2xs text-neutral-400'}>{hint}</span>}
            </span>
            <input
                ref={file}
                type={'file'}
                accept={'image/png,image/jpeg,image/webp,image/gif'}
                className={'hidden'}
                onChange={(e) => {
                    const picture = e.currentTarget.files?.[0];
                    e.currentTarget.value = '';
                    if (picture) onUpload(picture);
                }}
            />
            <button
                type={'button'}
                disabled={busy}
                onClick={() => file.current?.click()}
                className={
                    'rounded-md p-1.5 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-50 disabled:opacity-40'
                }
                aria-label={`Upload a banner for ${label}`}
                title={'Upload a banner'}
            >
                <UploadIcon className={'h-4 w-4'} />
            </button>
            {value && (
                <button
                    type={'button'}
                    onClick={() => onChange(null)}
                    className={'rounded-md p-1.5 text-neutral-400 hover:bg-neutral-600 hover:text-neutral-50'}
                    aria-label={`Remove the banner of ${label}`}
                    title={'Remove the banner'}
                >
                    <TrashIcon className={'h-4 w-4'} />
                </button>
            )}
        </li>
    );
};

const without = (record: Record<string, string>, key: string): Record<string, string> => {
    const { [key]: _removed, ...rest } = record;

    return rest;
};

/** Pictures for the server rows, one for each egg and one for each software (even those that are not an egg). */
export default ({
    banners,
    eggs,
    busy,
    upload,
    onChange,
}: {
    banners: Banners;
    eggs: EggInfo[] | null;
    busy: boolean;
    upload: (picture: File, done: (url: string) => void) => void;
    onChange: (banners: Banners) => void;
}) => (
    <div className={'space-y-4'}>
        <p className={'text-xs text-neutral-400'}>
            The picture fills the whole row of a server, instead of the faint logo of its software. A server gets the
            banner of its egg, and if there is none the one of its software.
        </p>
        <Row label={'Cover the picture with the card colour'}>
            <Slider value={banners.dim} min={0} max={90} unit={'%'} onChange={(dim) => onChange({ ...banners, dim })} />
        </Row>
        <div>
            <p className={'mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400'}>Eggs</p>
            <ul className={'rounded-lg border border-neutral-500'}>
                {eggs === null && <li className={'px-3 py-2 text-xs text-neutral-400'}>Loading the eggs...</li>}
                {eggs?.length === 0 && <li className={'px-3 py-2 text-xs text-neutral-400'}>There are no eggs yet.</li>}
                {eggs?.map((egg) => (
                    <BannerPick
                        key={egg.id}
                        label={egg.name}
                        hint={egg.nest}
                        value={banners.eggs[String(egg.id)]}
                        busy={busy}
                        onUpload={(picture) =>
                            upload(picture, (url) => onChange({ ...banners, eggs: { ...banners.eggs, [egg.id]: url } }))
                        }
                        onChange={() => onChange({ ...banners, eggs: without(banners.eggs, String(egg.id)) })}
                    />
                ))}
            </ul>
        </div>
        <div>
            <p className={'mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400'}>Software</p>
            <ul className={'rounded-lg border border-neutral-500'}>
                {[{ type: 'VANILLA', name: 'Vanilla' }, ...SOFTWARE].map((software) => (
                    <BannerPick
                        key={software.type}
                        label={software.name}
                        value={banners.software[software.type]}
                        busy={busy}
                        onUpload={(picture) =>
                            upload(picture, (url) =>
                                onChange({ ...banners, software: { ...banners.software, [software.type]: url } })
                            )
                        }
                        onChange={() => onChange({ ...banners, software: without(banners.software, software.type) })}
                    />
                ))}
            </ul>
        </div>
    </div>
);

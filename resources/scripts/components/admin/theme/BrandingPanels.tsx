import React, { useEffect, useState } from 'react';
import { PlusIcon, TrashIcon, UploadIcon } from '@heroicons/react/solid';
import http, { httpErrorToHuman } from '@/api/http';
import { Button } from '@/components/elements/button/index';
import { Row, Switch, Toggle } from '@/components/admin/theme/controls';
import { logoUrl } from '@/lib/branding';

export interface Announcement {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'danger';
    enabled: boolean;
    dismissible: boolean;
    link_label: string;
    link_url: string;
    // Where it is shown and what a person must have to see it, see lib/branding.ts.
    where: ('dashboard' | 'server' | 'account')[];
    eggs: number[];
    software: string[];
    nodes: string[];
}

export interface BrandLink {
    label: string;
    url: string;
    location: string;
    new_tab: boolean;
}

export interface Seo {
    title: string;
    description: string;
    share_image: string;
    theme_color: string;
    app_name: string;
    app_short_name: string;
    index: boolean;
}

export interface BrandingData {
    favicon: string | null;
    link_cards: import('@/components/admin/theme/LinkCardsPanel').LinkCardEdit[];
    console_prompt: string;
    seo: Seo;
    announcements: Announcement[];
    links: BrandLink[];
    locations: Record<string, string>;
    types: string[];
}

const field = 'w-full rounded-lg border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-100';

/** Saving a list of the branding, with the answer of the panel shown under the button. */
const useSave = (onSaved: () => void) => {
    const [state, setState] = useState<{ busy: boolean; message: string | null; error: boolean }>({
        busy: false,
        message: null,
        error: false,
    });

    return {
        ...state,
        run: (work: () => Promise<unknown>, done = 'Saved.') => {
            setState({ busy: true, message: null, error: false });
            work()
                .then(() => {
                    setState({ busy: false, message: done, error: false });
                    onSaved();
                })
                .catch((e) => setState({ busy: false, message: httpErrorToHuman(e), error: true }));
        },
    };
};

/** The logo of the panel (its favicon) and the links in the bars. These are branding, not theme: they are saved here, not with the theme. */
export const BrandingPanel = ({
    data,
    onSaved,
    onDraft,
}: {
    data: BrandingData;
    onSaved: () => void;
    // The links as they are now, saved or not, for the live preview.
    onDraft: (links: BrandLink[]) => void;
}) => {
    const [links, setLinks] = useState<BrandLink[]>(data.links);
    const [prompt, setPrompt] = useState(data.console_prompt);
    useEffect(() => onDraft(links), [links]);
    const save = useSave(onSaved);
    const change = (i: number, changes: Partial<BrandLink>) =>
        setLinks(links.map((l, at) => (at === i ? { ...l, ...changes } : l)));

    const upload = (picture: File) => {
        const form = new FormData();
        form.append('favicon', picture);
        save.run(
            () =>
                http.post('/api/client/theme/branding/favicon', form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                }),
            'Logo changed.'
        );
    };

    return (
        <div className={'space-y-4'}>
            <Row label={'Logo and favicon'}>
                <div className={'flex items-center gap-3'}>
                    <img
                        src={logoUrl(data.favicon)}
                        alt={''}
                        className={'h-12 w-12 rounded-lg border border-neutral-500 object-contain p-1'}
                    />
                    <label
                        className={
                            'inline-flex cursor-pointer items-center rounded-lg border border-neutral-500 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-600'
                        }
                    >
                        <UploadIcon className={'mr-1.5 h-4 w-4'} />
                        Upload
                        <input
                            type={'file'}
                            accept={'image/png,image/x-icon,image/gif,image/jpeg'}
                            className={'hidden'}
                            onChange={(e) => {
                                const picture = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (picture) upload(picture);
                            }}
                        />
                    </label>
                    {data.favicon && (
                        <button
                            type={'button'}
                            className={'text-xs text-primary-600'}
                            onClick={() =>
                                save.run(() => http.delete('/api/client/theme/branding/favicon'), 'Logo removed.')
                            }
                        >
                            Use the default
                        </button>
                    )}
                </div>
                <p className={'mt-1 text-2xs text-neutral-400'}>
                    The same picture is the logo of the panel and the icon of the browser tab (png, ico, gif or jpg, 512
                    KB).
                </p>
            </Row>
            <Row label={'Console prompt'}>
                <div className={'flex items-center gap-2'}>
                    <input
                        value={prompt}
                        maxLength={40}
                        spellCheck={false}
                        placeholder={'container@stratosphere~'}
                        onChange={(e) => setPrompt(e.currentTarget.value)}
                        className={`${field} font-mono text-xs`}
                    />
                    <Button
                        type={'button'}
                        disabled={save.busy}
                        onClick={() =>
                            save.run(
                                () => http.put('/api/client/theme/branding', { console_prompt: prompt }),
                                'Prompt saved.'
                            )
                        }
                    >
                        Save
                    </Button>
                </div>
                <p className={'mt-1 text-2xs text-neutral-400'}>
                    The start of the lines the panel writes in a server console, like{' '}
                    <code>{prompt || 'container@stratosphere~'} Server marked as offline...</code>. Letters, numbers and
                    @ . _ ~ : - only. Empty is the default.
                </p>
            </Row>
            <Row label={'Links in the bars'}>
                <div className={'space-y-2'}>
                    {links.length === 0 && <p className={'text-xs text-neutral-400'}>No links yet.</p>}
                    {links.map((link, i) => (
                        <div key={i} className={'space-y-2 rounded-lg border border-neutral-500 p-2'}>
                            <div className={'flex gap-2'}>
                                <input
                                    value={link.label}
                                    maxLength={50}
                                    placeholder={'Name'}
                                    onChange={(e) => change(i, { label: e.currentTarget.value })}
                                    className={field}
                                />
                                <button
                                    type={'button'}
                                    aria-label={'Remove the link'}
                                    className={'rounded-md p-1.5 text-neutral-400 hover:bg-neutral-600'}
                                    onClick={() => setLinks(links.filter((_, at) => at !== i))}
                                >
                                    <TrashIcon className={'h-4 w-4'} />
                                </button>
                            </div>
                            <input
                                value={link.url}
                                placeholder={'https://example.com or /page'}
                                onChange={(e) => change(i, { url: e.currentTarget.value })}
                                className={`${field} font-mono text-xs`}
                            />
                            <div className={'flex items-center gap-3'}>
                                <select
                                    value={link.location}
                                    onChange={(e) => change(i, { location: e.currentTarget.value })}
                                    className={`${field} flex-1`}
                                >
                                    {Object.entries(data.locations).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                                <span className={'flex items-center gap-1.5 text-xs text-neutral-300'}>
                                    <Switch
                                        checked={link.new_tab}
                                        onChange={(new_tab) => change(i, { new_tab })}
                                        label={'Open in a new tab'}
                                    />
                                    New tab
                                </span>
                            </div>
                        </div>
                    ))}
                    <div className={'flex items-center gap-3'}>
                        <Button.Text
                            type={'button'}
                            disabled={links.length >= 20}
                            onClick={() =>
                                setLinks([...links, { label: '', url: '', location: 'footer', new_tab: true }])
                            }
                        >
                            <PlusIcon className={'mr-1 h-4 w-4'} />
                            Add a link
                        </Button.Text>
                        <Button
                            type={'button'}
                            disabled={save.busy}
                            onClick={() =>
                                save.run(() => http.put('/api/client/theme/branding', { links }), 'Links saved.')
                            }
                        >
                            Save links
                        </Button>
                    </div>
                </div>
            </Row>
            {save.message && (
                <p className={`text-xs ${save.error ? 'text-red-600' : 'text-green-700'}`}>{save.message}</p>
            )}
        </div>
    );
};

const preview = (value: string, fallback: string) => (value.trim() !== '' ? value.trim() : fallback);

/** What search engines and a shared link say, what an installed app is called, and the colour of the bar of the browser. */
export const SeoPanel = ({
    data,
    siteName,
    busy,
    upload,
    onSaved,
}: {
    data: BrandingData;
    siteName: string;
    busy: boolean;
    upload: (picture: File, done: (url: string) => void) => void;
    onSaved: () => void;
}) => {
    const [seo, setSeo] = useState<Seo>(data.seo);
    const save = useSave(onSaved);
    const change = (changes: Partial<Seo>) => setSeo({ ...seo, ...changes });
    const host = typeof window !== 'undefined' ? window.location.host : 'panel.example.com';

    return (
        <div className={'space-y-4'}>
            <p className={'text-xs text-neutral-400'}>
                What is shown in a search result and when somebody shares a link to the panel, and what the installed
                app is called. An empty field keeps the default, the name of the panel.
            </p>
            <div className={'overflow-hidden rounded-xl border border-neutral-500 bg-white'}>
                {seo.share_image ? (
                    <div
                        className={'h-32 bg-neutral-600 bg-cover bg-center'}
                        style={{ backgroundImage: `url("${seo.share_image}")` }}
                    />
                ) : (
                    <div className={'flex h-32 items-center justify-center bg-neutral-600 text-xs text-neutral-400'}>
                        No share image
                    </div>
                )}
                <div className={'p-3'}>
                    <p className={'text-2xs uppercase text-neutral-400'}>{host}</p>
                    <p className={'truncate text-sm font-semibold text-neutral-50'}>{preview(seo.title, siteName)}</p>
                    <p className={'line-clamp-2 text-xs text-neutral-300'}>
                        {preview(seo.description, 'No description.')}
                    </p>
                </div>
            </div>
            <Row label={'Title'}>
                <input
                    value={seo.title}
                    maxLength={70}
                    placeholder={siteName}
                    onChange={(e) => change({ title: e.currentTarget.value })}
                    className={field}
                />
            </Row>
            <Row label={'Description'}>
                <textarea
                    value={seo.description}
                    maxLength={200}
                    rows={3}
                    placeholder={'One or two sentences about the panel'}
                    onChange={(e) => change({ description: e.currentTarget.value })}
                    className={field}
                />
                <p className={'mt-1 text-2xs text-neutral-400'}>
                    {seo.description.length}/200, about 150 to 160 is what search engines show.
                </p>
            </Row>
            <Row label={'Share image'}>
                <div className={'flex items-center gap-2'}>
                    <label
                        className={
                            'inline-flex cursor-pointer items-center rounded-lg border border-neutral-500 px-3 py-1.5 text-sm text-neutral-100 hover:bg-neutral-600'
                        }
                    >
                        <UploadIcon className={'mr-1.5 h-4 w-4'} />
                        Upload
                        <input
                            type={'file'}
                            accept={'image/png,image/jpeg,image/webp,image/gif'}
                            className={'hidden'}
                            disabled={busy}
                            onChange={(e) => {
                                const picture = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (picture) upload(picture, (url) => change({ share_image: url }));
                            }}
                        />
                    </label>
                    <input
                        value={seo.share_image}
                        placeholder={'Or an https:// address'}
                        onChange={(e) => change({ share_image: e.currentTarget.value.trim() })}
                        className={`${field} font-mono text-xs`}
                    />
                    {seo.share_image && (
                        <button
                            type={'button'}
                            className={'text-xs text-primary-600'}
                            onClick={() => change({ share_image: '' })}
                        >
                            Remove
                        </button>
                    )}
                </div>
                <p className={'mt-1 text-2xs text-neutral-400'}>1200 by 630 pixels works best on most services.</p>
            </Row>
            <Row label={'Colour of the browser bar and of the installed app'}>
                <div className={'flex items-center gap-2'}>
                    <input
                        type={'color'}
                        value={seo.theme_color || '#ffffff'}
                        onChange={(e) => change({ theme_color: e.currentTarget.value })}
                        className={'h-9 w-12 cursor-pointer rounded-lg border border-neutral-500 bg-transparent p-0.5'}
                        aria-label={'Colour'}
                    />
                    <span className={'font-mono text-xs text-neutral-300'}>
                        {seo.theme_color || 'Follows light and dark'}
                    </span>
                    {seo.theme_color && (
                        <button
                            type={'button'}
                            className={'text-xs text-primary-600'}
                            onClick={() => change({ theme_color: '' })}
                        >
                            Follow light and dark
                        </button>
                    )}
                </div>
            </Row>
            <Row label={'Installed app'}>
                <div className={'flex gap-2'}>
                    <input
                        value={seo.app_name}
                        maxLength={45}
                        placeholder={`Name (${preview(seo.title, siteName)})`}
                        onChange={(e) => change({ app_name: e.currentTarget.value })}
                        className={field}
                    />
                    <input
                        value={seo.app_short_name}
                        maxLength={12}
                        placeholder={'Short name'}
                        onChange={(e) => change({ app_short_name: e.currentTarget.value })}
                        className={`${field} w-32`}
                    />
                </div>
                <p className={'mt-1 text-2xs text-neutral-400'}>
                    The name under the icon when the panel is added to a home screen or installed from the browser. The
                    icon is the logo. The short name is for places with little room (12 characters).
                </p>
            </Row>
            <Toggle
                label={'Let search engines list the sign in page'}
                checked={seo.index}
                onChange={(index) => change({ index })}
            />
            <div className={'flex items-center gap-3'}>
                <Button
                    type={'button'}
                    disabled={save.busy}
                    onClick={() => save.run(() => http.put('/api/client/theme/branding', { seo }), 'Saved.')}
                >
                    Save
                </Button>
                {save.message && (
                    <span className={`text-xs ${save.error ? 'text-red-600' : 'text-green-700'}`}>{save.message}</span>
                )}
            </div>
        </div>
    );
};

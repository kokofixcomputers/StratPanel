import React, { useRef, useState } from 'react';
import { BellIcon, LinkIcon, PhotographIcon, PlusIcon, TerminalIcon, TrashIcon } from '@heroicons/react/solid';
import SettingsFrame from '@/components/admin/pages/settings/SettingsFrame';
import { AreaField, Columns, SelectField, Stack, TextField, ToggleField } from '@/components/admin/forms';
import { Empty } from '@/components/admin/AdminTable';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import useAdmin from '@/plugins/useAdmin';
import useSettingForm from '@/plugins/useSettingForm';
import { Announcement, Branding, BrandLink } from '@/api/admin/settings';

interface Values {
    console_prompt: string;
    announcements: Announcement[];
    links: BrandLink[];
}

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The list goes to the server as form fields (the favicon is a file, so the whole page is one multipart form). */
const toForm = (values: Values, favicon: File | null, removeFavicon: boolean): FormData => {
    const form = new FormData();
    if (favicon) form.append('favicon', favicon);
    else if (removeFavicon) form.append('remove_favicon', '1');
    form.append('console_prompt', values.console_prompt);
    values.announcements.forEach((a, i) => {
        (Object.keys(a) as (keyof Announcement)[]).forEach((key) => {
            const value = a[key];
            form.append(
                `announcements[${i}][${key}]`,
                typeof value === 'boolean' ? (value ? '1' : '0') : String(value ?? '')
            );
        });
    });
    values.links.forEach((l, i) => {
        (Object.keys(l) as (keyof BrandLink)[]).forEach((key) => {
            const value = l[key];
            form.append(`links[${i}][${key}]`, typeof value === 'boolean' ? (value ? '1' : '0') : String(value ?? ''));
        });
    });

    return form;
};

/** Admin > Settings > Branding: the favicon, the console prompt, announcements and custom links. */
export default () => {
    const admin = useAdmin();
    const can = admin.can('settings.branding.update');
    const picker = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [remove, setRemove] = useState(false);
    const { data, values, set, busy, save } = useSettingForm<Branding, Values>(
        'branding',
        (d) => ({ console_prompt: d.console_prompt, announcements: d.announcements, links: d.links }),
        'Branding has been updated.',
        'post'
    );

    if (!data || !values) {
        return (
            <SettingsFrame title={'Branding'} subtitle={'Make the panel your own.'}>
                <Spinner size={'large'} centered />
            </SettingsFrame>
        );
    }

    const setAnnouncement = (index: number, changes: Partial<Announcement>) =>
        set({ announcements: values.announcements.map((a, i) => (i === index ? { ...a, ...changes } : a)) });
    const setLink = (index: number, changes: Partial<BrandLink>) =>
        set({ links: values.links.map((l, i) => (i === index ? { ...l, ...changes } : l)) });

    return (
        <SettingsFrame title={'Branding'} subtitle={'Make the panel your own.'}>
            <div className={'space-y-4'}>
                <SectionCard icon={<PhotographIcon className={'h-5 w-5'} />} title={'Favicon'}>
                    <div className={'flex flex-wrap items-center gap-4'}>
                        {(file || (data.favicon && !remove)) && (
                            <img
                                alt={'Favicon'}
                                className={'h-12 w-12 rounded border border-neutral-500 object-contain p-1'}
                                src={file ? URL.createObjectURL(file) : data.favicon ?? ''}
                            />
                        )}
                        <div className={'space-y-1'}>
                            <p className={'text-sm text-neutral-200'}>
                                {file
                                    ? file.name
                                    : data.favicon && !remove
                                    ? 'A custom favicon is in use.'
                                    : 'The default favicon is in use.'}
                            </p>
                            <p className={'text-xs text-neutral-400'}>
                                PNG, ICO, GIF or JPG up to 512 KB. A square PNG of at least 64 by 64 pixels works best.
                                It is used on every page of the panel.
                            </p>
                        </div>
                        {can && (
                            <div className={'flex gap-2'}>
                                <input
                                    ref={picker}
                                    type={'file'}
                                    accept={'.png,.ico,.gif,.jpg,.jpeg,image/*'}
                                    className={'hidden'}
                                    onChange={(e) => {
                                        setFile(e.currentTarget.files?.[0] ?? null);
                                        setRemove(false);
                                    }}
                                />
                                <Button.Text onClick={() => picker.current?.click()}>Choose image</Button.Text>
                                {data.favicon && !remove && !file && (
                                    <Button.Text onClick={() => setRemove(true)}>Go back to the default</Button.Text>
                                )}
                            </div>
                        )}
                    </div>
                </SectionCard>

                <SectionCard icon={<TerminalIcon className={'h-5 w-5'} />} title={'Console prompt'}>
                    <TextField
                        id={'console-prompt'}
                        label={"Start of the panel's own lines"}
                        value={values.console_prompt}
                        maxLength={40}
                        disabled={!can}
                        onChange={(console_prompt) => set({ console_prompt })}
                        help={`The text in front of the lines the panel writes in a server's console, such as "${
                            values.console_prompt || data.console_prompt
                        } Server marked as offline...". Leave it empty for the default.`}
                    />
                </SectionCard>

                <SectionCard
                    icon={<BellIcon className={'h-5 w-5'} />}
                    title={'Announcements'}
                    description={
                        'Shown above the servers on the dashboard, in the order listed. People can dismiss an announcement, one that you edit shows again.'
                    }
                    badge={
                        can && (
                            <Button.Text
                                onClick={() =>
                                    set({
                                        announcements: [
                                            ...values.announcements,
                                            {
                                                id: '',
                                                title: '',
                                                message: '',
                                                type: 'info',
                                                enabled: true,
                                                dismissible: true,
                                                link_label: '',
                                                link_url: '',
                                            },
                                        ],
                                    })
                                }
                            >
                                <PlusIcon className={'-ml-1 mr-1 h-4 w-4'} />
                                Add announcement
                            </Button.Text>
                        )
                    }
                >
                    {values.announcements.length === 0 ? (
                        <Empty>There are no announcements yet.</Empty>
                    ) : (
                        <div className={'space-y-4'}>
                            {values.announcements.map((a, i) => (
                                <div key={i} className={'space-y-3 rounded-lg border border-neutral-500 p-4'}>
                                    <Columns>
                                        <TextField
                                            id={`a-title-${i}`}
                                            label={'Title (optional)'}
                                            value={a.title}
                                            maxLength={100}
                                            disabled={!can}
                                            onChange={(title) => setAnnouncement(i, { title })}
                                        />
                                        <SelectField
                                            id={`a-type-${i}`}
                                            label={'Type'}
                                            value={a.type}
                                            disabled={!can}
                                            choices={data.types.map((t) => ({ value: t, label: cap(t) }))}
                                            onChange={(type) => setAnnouncement(i, { type })}
                                        />
                                    </Columns>
                                    <AreaField
                                        id={`a-message-${i}`}
                                        label={'Message'}
                                        value={a.message}
                                        maxLength={1000}
                                        disabled={!can}
                                        onChange={(message) => setAnnouncement(i, { message })}
                                    />
                                    <Columns>
                                        <TextField
                                            id={`a-link-label-${i}`}
                                            label={'Link text (optional)'}
                                            value={a.link_label}
                                            maxLength={50}
                                            disabled={!can}
                                            onChange={(link_label) => setAnnouncement(i, { link_label })}
                                        />
                                        <TextField
                                            id={`a-link-url-${i}`}
                                            label={'Link address (optional)'}
                                            value={a.link_url}
                                            maxLength={500}
                                            disabled={!can}
                                            onChange={(link_url) => setAnnouncement(i, { link_url })}
                                            help={'Starts with http://, https:// or /.'}
                                        />
                                    </Columns>
                                    <div className={'flex flex-wrap items-center justify-between gap-4'}>
                                        <div className={'flex flex-wrap gap-6'}>
                                            <ToggleField
                                                label={'Shown'}
                                                checked={a.enabled}
                                                disabled={!can}
                                                onChange={(enabled) => setAnnouncement(i, { enabled })}
                                            />
                                            <ToggleField
                                                label={'Can be dismissed'}
                                                checked={a.dismissible}
                                                disabled={!can}
                                                onChange={(dismissible) => setAnnouncement(i, { dismissible })}
                                            />
                                        </div>
                                        {can && (
                                            <Button.Text
                                                onClick={() =>
                                                    set({
                                                        announcements: values.announcements.filter((_, n) => n !== i),
                                                    })
                                                }
                                            >
                                                <TrashIcon className={'-ml-1 mr-1 h-4 w-4 text-red-500'} />
                                                Remove
                                            </Button.Text>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>

                <SectionCard
                    icon={<LinkIcon className={'h-5 w-5'} />}
                    title={'Custom links'}
                    description={
                        'Links to your own site, a status page, a Discord invite or the rules. Choose where each one appears: in the sidebar of a server, the top bar or the footer of the panel.'
                    }
                    badge={
                        can && (
                            <Button.Text
                                onClick={() =>
                                    set({
                                        links: [
                                            ...values.links,
                                            { label: '', url: '', location: 'footer', new_tab: true },
                                        ],
                                    })
                                }
                            >
                                <PlusIcon className={'-ml-1 mr-1 h-4 w-4'} />
                                Add link
                            </Button.Text>
                        )
                    }
                >
                    {values.links.length === 0 ? (
                        <Empty>There are no custom links yet.</Empty>
                    ) : (
                        <Stack>
                            {values.links.map((l, i) => (
                                <div key={i} className={'space-y-3 rounded-lg border border-neutral-500 p-4'}>
                                    <Columns>
                                        <TextField
                                            id={`l-label-${i}`}
                                            label={'Label'}
                                            value={l.label}
                                            maxLength={50}
                                            disabled={!can}
                                            onChange={(label) => setLink(i, { label })}
                                        />
                                        <TextField
                                            id={`l-url-${i}`}
                                            label={'Address'}
                                            value={l.url}
                                            maxLength={500}
                                            disabled={!can}
                                            onChange={(url) => setLink(i, { url })}
                                            help={'Starts with http://, https:// or /.'}
                                        />
                                    </Columns>
                                    <div className={'flex flex-wrap items-end justify-between gap-4'}>
                                        <div className={'flex flex-wrap items-end gap-6'}>
                                            <SelectField
                                                id={`l-location-${i}`}
                                                label={'Where'}
                                                value={l.location}
                                                disabled={!can}
                                                choices={Object.entries(data.locations).map(([value, label]) => ({
                                                    value,
                                                    label,
                                                }))}
                                                onChange={(location) => setLink(i, { location })}
                                            />
                                            <ToggleField
                                                label={'New tab'}
                                                checked={l.new_tab}
                                                disabled={!can}
                                                onChange={(new_tab) => setLink(i, { new_tab })}
                                            />
                                        </div>
                                        {can && (
                                            <Button.Text
                                                onClick={() => set({ links: values.links.filter((_, n) => n !== i) })}
                                            >
                                                <TrashIcon className={'-ml-1 mr-1 h-4 w-4 text-red-500'} />
                                                Remove
                                            </Button.Text>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </Stack>
                    )}
                </SectionCard>

                {can && (
                    <div className={'flex justify-end'}>
                        <Button
                            disabled={busy}
                            onClick={() =>
                                save(toForm(values, file, remove)).then((fresh) => {
                                    if (fresh) {
                                        setFile(null);
                                        setRemove(false);
                                    }
                                })
                            }
                        >
                            Save changes
                        </Button>
                    </div>
                )}
            </div>
        </SettingsFrame>
    );
};

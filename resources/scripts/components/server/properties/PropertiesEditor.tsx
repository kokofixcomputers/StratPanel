import React, { useEffect, useMemo, useState } from 'react';
import tw from 'twin.macro';
import { RefreshIcon, SearchIcon, SaveIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import PageHeader, { EmptyState } from '@/components/elements/PageHeader';
import FlashMessageRender from '@/components/FlashMessageRender';
import Spinner from '@/components/elements/Spinner';
import Switch from '@/components/elements/Switch';
import Input from '@/components/elements/Input';
import Select from '@/components/elements/Select';
import { Button } from '@/components/elements/button/index';
import useFlash from '@/plugins/useFlash';
import { deleteServerIcon, fetchServerIcon, toIconPng, uploadServerIcon } from '@/lib/serverIcon';
import saveFileContents from '@/api/server/files/saveFileContents';
import { httpErrorToHuman } from '@/api/http';
import { detectType, parseProperties, PropertyLine, readOptionalFile, serializeProperties } from '@/lib/minecraft';
import MotdBuilder from '@/components/server/properties/MotdBuilder';
import { getPropertyMeta } from '@/components/server/properties/propertyMeta';

const FILE = '/server.properties';

const PropertyCard = ({
    property,
    original,
    onChange,
}: {
    property: PropertyLine;
    original: string;
    onChange: (value: string) => void;
}) => {
    const meta = getPropertyMeta(property.key);
    const type = detectType(original ?? property.value);
    const changed = property.value !== original;

    return (
        <div css={tw`flex flex-col bg-white border border-neutral-500 rounded-xl shadow-md overflow-hidden`}>
            <div css={tw`flex items-center justify-between px-5 py-4 border-b border-neutral-500`}>
                <h3 css={tw`text-base font-semibold text-neutral-50 truncate`}>{meta.title}</h3>
                {changed && <span css={tw`ml-2 w-2 h-2 rounded-full bg-primary-600 flex-shrink-0`} title={'Unsaved'} />}
            </div>
            <div css={tw`flex flex-col flex-1 p-5`}>
                {meta.description && <p css={tw`text-sm text-neutral-400 mb-4`}>{meta.description}</p>}
                <div css={tw`mt-auto`}>
                    {type === 'boolean' ? (
                        <div css={tw`flex items-center justify-between`}>
                            <span css={tw`text-sm text-neutral-300`}>
                                {property.value === 'true' ? 'Enabled' : 'Disabled'}
                            </span>
                            <Switch
                                key={`${property.key}-${property.value}`}
                                name={property.key}
                                defaultChecked={property.value === 'true'}
                                onChange={(e) => onChange(e.currentTarget.checked ? 'true' : 'false')}
                            />
                        </div>
                    ) : meta.options ? (
                        <Select value={property.value} onChange={(e) => onChange(e.currentTarget.value)}>
                            {meta.options.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </Select>
                    ) : (
                        <Input
                            type={type === 'number' ? 'number' : 'text'}
                            value={property.value}
                            css={tw`font-mono`}
                            onChange={(e) => onChange(e.currentTarget.value)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const serverName = ServerContext.useStoreState((state) => state.server.data!.name);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const [canRestart] = usePermissions(['control.restart']);
    const { addFlash, clearFlashes } = useFlash();

    const [raw, setRaw] = useState<string | null>(null);
    const [missing, setMissing] = useState(false);
    const [original, setOriginal] = useState<Record<string, string>>({});
    const [values, setValues] = useState<PropertyLine[]>([]);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    // The icon on the server, and a change that is waiting for Save: a new image, or null to delete it.
    const [icon, setIcon] = useState<string | null>(null);
    const [pendingIcon, setPendingIcon] = useState<{ blob: Blob | null; url: string | null } | null>(null);

    useEffect(() => {
        let url: string | null = null;
        fetchServerIcon(uuid).then((found) => {
            url = found;
            setIcon(found);
        });

        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [uuid]);

    const pickIcon = async (file: File) => {
        try {
            const blob = await toIconPng(file);
            setPendingIcon({ blob, url: URL.createObjectURL(blob) });
        } catch (e) {
            addFlash({ key: 'properties', type: 'error', message: (e as Error).message });
        }
    };

    const shownIcon = pendingIcon ? pendingIcon.url : icon;

    const load = () =>
        readOptionalFile(uuid, FILE).then((content) => {
            if (content === null) {
                setMissing(true);
                setRaw('');
                return;
            }

            const parsed = parseProperties(content);
            setOriginal(Object.fromEntries(parsed.map((line) => [line.key, line.value])));
            setValues(parsed);
            setRaw(content);
        });

    useEffect(() => {
        load();
    }, [uuid]);

    const dirty = useMemo(
        () => values.some((line) => original[line.key] !== line.value) || !!pendingIcon,
        [values, original, pendingIcon]
    );

    const filtered = useMemo(
        () =>
            values
                .filter((line) => {
                    // The message of the day has its own builder at the top of the page.
                    if (line.key === 'motd') return false;

                    const meta = getPropertyMeta(line.key);
                    const haystack = `${line.key} ${meta.title} ${meta.description}`.toLowerCase();

                    return !search || haystack.includes(search.toLowerCase());
                })
                .sort((a, b) => getPropertyMeta(a.key).title.localeCompare(getPropertyMeta(b.key).title)),
        [values, search]
    );

    const save = async (restart = false) => {
        setSaving(true);
        clearFlashes('properties');

        try {
            await saveFileContents(
                uuid,
                FILE,
                serializeProperties(raw || '', Object.fromEntries(values.map((l) => [l.key, l.value])))
            );
            setOriginal(Object.fromEntries(values.map((line) => [line.key, line.value])));

            if (pendingIcon) {
                if (pendingIcon.blob) await uploadServerIcon(uuid, pendingIcon.blob);
                else await deleteServerIcon(uuid);
                setIcon(pendingIcon.url);
                setPendingIcon(null);
            }

            if (restart) instance?.send('set state', 'restart');
            addFlash({
                key: 'properties',
                type: 'success',
                message: restart
                    ? 'Saved. The server is restarting to apply the changes.'
                    : 'Saved. Restart the server for the changes to take effect.',
            });
        } catch (error) {
            addFlash({ key: 'properties', type: 'error', message: httpErrorToHuman(error) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <ServerContentBlock title={'Server Properties'}>
            <PageHeader title={'Server Properties'} subtitle={`View and edit server.properties for ${serverName}`} />
            <FlashMessageRender byKey={'properties'} css={tw`mb-4`} />
            {raw === null ? (
                <Spinner size={'large'} centered />
            ) : missing ? (
                <EmptyState>
                    server.properties does not exist yet. Start the server once so Minecraft can generate it.
                </EmptyState>
            ) : (
                <>
                    <MotdBuilder
                        icon={shownIcon}
                        onPickIcon={pickIcon}
                        onRemoveIcon={() => setPendingIcon({ blob: null, url: null })}
                        maxPlayers={parseInt(values.find((line) => line.key === 'max-players')?.value ?? '', 10) || 20}
                        value={values.find((line) => line.key === 'motd')?.value ?? 'A Minecraft Server'}
                        onChange={(encoded) =>
                            setValues((all) =>
                                all.some((line) => line.key === 'motd')
                                    ? all.map((line) => (line.key === 'motd' ? { ...line, value: encoded } : line))
                                    : [...all, { key: 'motd', value: encoded }]
                            )
                        }
                    />
                    <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5 mb-4`}>
                        <p css={tw`text-base font-semibold text-neutral-50 mb-3`}>Search Properties</p>
                        <div css={tw`flex items-center gap-3`}>
                            <div css={tw`relative flex-1`}>
                                <SearchIcon css={tw`absolute left-4 top-0 bottom-0 my-auto w-5 h-5 text-neutral-400`} />
                                <Input
                                    type={'text'}
                                    value={search}
                                    placeholder={'Search for properties...'}
                                    style={{ paddingLeft: '3rem' }}
                                    onChange={(e) => setSearch(e.currentTarget.value)}
                                />
                            </div>
                            <Button onClick={() => save()} disabled={!dirty || saving}>
                                <SaveIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                                {saving ? 'Saving...' : 'Save'}
                            </Button>
                            {canRestart && (
                                <Button
                                    variant={Button.Variants.Secondary}
                                    onClick={() => save(true)}
                                    disabled={!dirty || saving || !instance}
                                    title={'Save the changes and restart the server'}
                                >
                                    <RefreshIcon css={tw`w-4 h-4 mr-2 -ml-1`} />
                                    Save &amp; Restart
                                </Button>
                            )}
                        </div>
                    </div>
                    {filtered.length === 0 ? (
                        <EmptyState>No properties match your search.</EmptyState>
                    ) : (
                        <div css={tw`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`}>
                            {filtered.map((property) => (
                                <PropertyCard
                                    key={property.key}
                                    property={property}
                                    original={original[property.key]}
                                    onChange={(value) =>
                                        setValues((all) =>
                                            all.map((line) => (line.key === property.key ? { ...line, value } : line))
                                        )
                                    }
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </ServerContentBlock>
    );
};

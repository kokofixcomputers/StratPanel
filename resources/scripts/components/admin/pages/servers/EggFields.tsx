import React from 'react';
import { Columns, SelectField, Stack, TextField, ToggleField, AreaField } from '@/components/admin/forms';
import { NestChoice } from '@/api/admin/servers';

export interface EggValue {
    nest_id: string;
    egg_id: string;
    // The image of the list, or "" when a custom one is typed.
    image: string;
    custom_image: string;
    startup: string;
    skip_scripts: boolean;
    environment: Record<string, string>;
}

/** What choosing an egg fills in: its first image, its startup command and the default of each variable. */
export const eggDefaults = (nests: NestChoice[], nestId: string, eggId: string, keep?: Partial<EggValue>): EggValue => {
    const nest = nests.find((n) => String(n.id) === nestId) ?? nests[0];
    const egg = nest?.eggs.find((e) => String(e.id) === eggId) ?? nest?.eggs[0];
    const images = Object.values(egg?.docker_images ?? {});

    return {
        nest_id: String(nest?.id ?? ''),
        egg_id: String(egg?.id ?? ''),
        image: images[0] ?? '',
        custom_image: '',
        startup: egg?.startup ?? '',
        skip_scripts: false,
        environment: Object.fromEntries((egg?.variables ?? []).map((v) => [v.env_variable, v.default_value])),
        ...keep,
    };
};

/** The nest, the egg, the image, the startup command and the variables of an egg: the same in the form of a new server and on the startup page. */
export default ({
    nests,
    value,
    onChange,
    disabled = false,
    showStartup = true,
    scriptsHelp,
}: {
    nests: NestChoice[];
    value: EggValue;
    onChange: (value: EggValue) => void;
    disabled?: boolean;
    showStartup?: boolean;
    scriptsHelp: string;
}) => {
    const nest = nests.find((n) => String(n.id) === value.nest_id);
    const egg = nest?.eggs.find((e) => String(e.id) === value.egg_id);
    const images = Object.entries(egg?.docker_images ?? {});

    return (
        <Stack>
            <Columns>
                <SelectField
                    id={'egg-nest'}
                    label={'Nest'}
                    value={value.nest_id}
                    disabled={disabled}
                    choices={nests.map((n) => ({ value: String(n.id), label: n.name }))}
                    onChange={(nestId) =>
                        onChange(eggDefaults(nests, nestId, '', { skip_scripts: value.skip_scripts }))
                    }
                    help={'The nest this server is grouped into.'}
                />
                <SelectField
                    id={'egg-egg'}
                    label={'Egg'}
                    value={value.egg_id}
                    disabled={disabled}
                    choices={(nest?.eggs ?? []).map((e) => ({ value: String(e.id), label: e.name }))}
                    onChange={(eggId) =>
                        onChange(eggDefaults(nests, value.nest_id, eggId, { skip_scripts: value.skip_scripts }))
                    }
                    help={'The egg that provides the processing data for this server.'}
                />
            </Columns>
            <ToggleField
                label={'Skip egg install script'}
                help={scriptsHelp}
                checked={value.skip_scripts}
                disabled={disabled}
                onChange={(skip_scripts) => onChange({ ...value, skip_scripts })}
            />
            <Columns>
                <SelectField
                    id={'egg-image'}
                    label={'Docker image'}
                    value={value.image}
                    disabled={disabled}
                    choices={[
                        {
                            value: '',
                            label: images.length > 0 ? 'A custom image (typed on the right)' : 'No image listed',
                        },
                        ...images.map(([name, image]) => ({ value: image, label: `${name} (${image})` })),
                    ]}
                    onChange={(image) => onChange({ ...value, image, custom_image: image ? '' : value.custom_image })}
                    help={'The Docker image used to run this server. Choose one of the list or type your own.'}
                />
                <TextField
                    id={'egg-custom-image'}
                    label={'Custom image'}
                    value={value.custom_image}
                    disabled={disabled}
                    placeholder={'ghcr.io/example/image:tag'}
                    onChange={(custom_image) =>
                        onChange({ ...value, custom_image, image: custom_image ? '' : value.image })
                    }
                />
            </Columns>
            {showStartup && (
                <AreaField
                    id={'egg-startup'}
                    label={'Startup command'}
                    rows={3}
                    mono
                    value={value.startup}
                    disabled={disabled}
                    onChange={(startup) => onChange({ ...value, startup })}
                    help={
                        'The startup command of this server. The following are available by default: {{SERVER_MEMORY}}, {{SERVER_IP}} and {{SERVER_PORT}}.'
                    }
                />
            )}
            {showStartup && egg && (
                <TextField
                    id={'egg-default-startup'}
                    label={'Default service start command'}
                    value={egg.startup}
                    disabled
                    onChange={() => undefined}
                />
            )}
            {(egg?.variables ?? []).length > 0 && (
                <>
                    <p className={'text-sm font-medium text-neutral-200'}>Service variables</p>
                    <Columns>
                        {(egg?.variables ?? []).map((variable) => (
                            <TextField
                                key={variable.id}
                                id={`egg-var-${variable.id}`}
                                label={`${variable.required ? 'Required: ' : ''}${variable.name}`}
                                value={value.environment[variable.env_variable] ?? ''}
                                disabled={disabled}
                                onChange={(v) =>
                                    onChange({
                                        ...value,
                                        environment: { ...value.environment, [variable.env_variable]: v },
                                    })
                                }
                                help={
                                    <>
                                        {variable.description}
                                        <br />
                                        <strong>Startup variable:</strong> <code>{`{{${variable.env_variable}}}`}</code>
                                        <br />
                                        <strong>Input rules:</strong> <code>{variable.rules}</code>
                                    </>
                                }
                            />
                        ))}
                    </Columns>
                </>
            )}
        </Stack>
    );
};

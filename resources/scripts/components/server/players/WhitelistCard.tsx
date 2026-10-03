import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { UserGroupIcon } from '@heroicons/react/outline';
import PlayerListCard, { usePlayerFile } from '@/components/server/players/PlayerListCard';
import Switch from '@/components/elements/Switch';
import { Dialog } from '@/components/elements/dialog';
import saveFileContents from '@/api/server/files/saveFileContents';
import { parseProperties, readOptionalFile, serializeProperties } from '@/lib/minecraft';
import { usePermissions } from '@/plugins/usePermissions';

const PROPERTIES = '/server.properties';

const WhitelistToggle = () => {
    const { uuid, running, instance } = usePlayerFile(PROPERTIES);
    const [canWrite] = usePermissions(['file.update']);
    const [canConsole] = usePermissions(['control.console']);
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [pending, setPending] = useState<boolean | null>(null);

    const load = () =>
        readOptionalFile(uuid, PROPERTIES).then((content) => {
            const value = parseProperties(content || '').find((line) => line.key === 'white-list')?.value;
            setEnabled(value === 'true');
        });

    useEffect(() => {
        load();
    }, [uuid]);

    const apply = async (next: boolean) => {
        setPending(null);

        if (running && instance) {
            instance.send('send command', `whitelist ${next ? 'on' : 'off'}`);
            setEnabled(next);
            return;
        }

        const content = (await readOptionalFile(uuid, PROPERTIES)) || '';
        await saveFileContents(uuid, PROPERTIES, serializeProperties(content, { 'white-list': String(next) }));
        setEnabled(next);
    };

    if (enabled === null || !(running ? canConsole : canWrite)) {
        return enabled === null ? null : (
            <span css={tw`text-sm text-neutral-400`}>{enabled ? 'Enabled' : 'Disabled'}</span>
        );
    }

    return (
        <>
            <Dialog.Confirm
                open={pending !== null}
                onClose={() => setPending(null)}
                title={pending ? 'Enable whitelist?' : 'Disable whitelist?'}
                confirm={pending ? 'Enable Whitelist' : 'Disable Whitelist'}
                onConfirmed={() => pending !== null && apply(pending)}
            >
                {pending
                    ? 'Only the players on this list will be able to join. Everyone else will be refused, so make sure your own name is on the list before you turn this on.'
                    : 'Anyone who knows the server address will be able to join, including players that are not on this list.'}
            </Dialog.Confirm>
            <div css={tw`flex items-center`}>
                <span css={tw`mr-3 text-sm text-neutral-300`}>{enabled ? 'Enabled' : 'Disabled'}</span>
                <Switch
                    key={String(enabled)}
                    name={'whitelist'}
                    defaultChecked={enabled}
                    onChange={(e) => {
                        // Keep the visual state until the player confirms in the warning dialog.
                        e.currentTarget.checked = enabled;
                        setPending(!enabled);
                    }}
                />
            </div>
        </>
    );
};

export default () => (
    <PlayerListCard
        header={<WhitelistToggle />}
        config={{
            file: '/whitelist.json',
            title: 'Whitelist',
            icon: <UserGroupIcon className={'w-6 h-6'} />,
            emptyText: 'Nobody is whitelisted yet.',
            placeholder: 'Minecraft username',
            addCommand: (name) => `whitelist add ${name}`,
            removeCommand: (name) => `whitelist remove ${name}`,
            toEntry: () => ({}),
        }}
    />
);

import React, { useState } from 'react';
import tw from 'twin.macro';
import { LinkIcon } from '@heroicons/react/solid';
import { ServerContext } from '@/state/server';
import Input from '@/components/elements/Input';
import Label from '@/components/elements/Label';
import { Button } from '@/components/elements/button/index';
import { runTask } from '@/lib/tasks';
import { fileNameOf, folderNameFor, installWorldFromLink, isValidFolderName } from '@/lib/worldImport';
import WorldManagerBox from '@/components/server/settings/WorldManagerBox';

/** Worlds are not on Modrinth, so they come from a link or an upload, next to the ones the server already has. */
export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const offline = status === 'offline';

    const [link, setLink] = useState('');
    const [name, setName] = useState('');
    const [named, setNamed] = useState(false);
    const [active, setActive] = useState(false);

    const onLink = (value: string) => {
        setLink(value);
        if (!named) setName(folderNameFor(fileNameOf(value)));
    };

    const valid = /^https?:\/\//i.test(link) && isValidFolderName(name);

    const install = () => {
        const chosen = { link: link.trim(), name, makeActive: active };
        setLink('');
        setName('');
        setNamed(false);
        runTask('extract', `Installing world ${chosen.name}`, (report) =>
            installWorldFromLink({ uuid, ...chosen, report })
        );
    };

    return (
        <>
            <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md mb-4`}>
                <div css={tw`flex items-center px-5 py-4 border-b border-neutral-500`}>
                    <LinkIcon css={tw`w-5 h-5 mr-2 text-primary-600`} />
                    <p css={tw`text-sm font-semibold text-neutral-50`}>Install a world from a link</p>
                </div>
                <div css={tw`p-5`}>
                    <p css={tw`text-sm text-neutral-400 mb-4`}>
                        Paste a direct link to a world as a .zip or .tar.gz file. It is added next to your other worlds,
                        nothing is replaced.
                    </p>
                    <div css={tw`grid gap-4 md:grid-cols-3`}>
                        <div css={tw`md:col-span-2`}>
                            <Label htmlFor={'world-link'}>Link</Label>
                            <Input
                                id={'world-link'}
                                value={link}
                                placeholder={'https://example.com/survival-map.zip'}
                                onChange={(e) => onLink(e.currentTarget.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor={'world-name'}>Folder name</Label>
                            <Input
                                id={'world-name'}
                                value={name}
                                placeholder={'survival-map'}
                                onChange={(e) => {
                                    setName(e.currentTarget.value);
                                    setNamed(true);
                                }}
                            />
                        </div>
                    </div>
                    <label css={tw`mt-4 flex items-center cursor-pointer`}>
                        <input
                            type={'checkbox'}
                            checked={active}
                            onChange={(e) => setActive(e.currentTarget.checked)}
                            css={tw`mr-3`}
                        />
                        <span css={tw`text-sm text-neutral-100`}>Use it as the world of the server</span>
                    </label>
                    <div css={tw`mt-4 flex items-center justify-between gap-3`}>
                        <p css={tw`text-xs text-neutral-400`}>
                            {offline
                                ? 'The download runs in the background, follow it in the task menu.'
                                : 'Stop the server first.'}
                        </p>
                        <Button disabled={!valid || !offline} onClick={install}>
                            Install world
                        </Button>
                    </div>
                </div>
            </div>
            <WorldManagerBox />
        </>
    );
};

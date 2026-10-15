import React, { useState } from 'react';
import tw from 'twin.macro';
import { TrashIcon } from '@heroicons/react/solid';
import Spinner from '@/components/elements/Spinner';
import { EmptyState } from '@/components/elements/PageHeader';
import { Button } from '@/components/elements/button/index';
import Switch from '@/components/elements/Switch';
import { httpErrorToHuman } from '@/api/http';
import useResourcePack from '@/components/server/mods/useResourcePack';
import ProjectIcon from '@/components/server/content/ProjectIcon';

/** The resource pack the server hands out: what it is, whether players must accept it, and a way to remove it. */
export default ({
    state,
    onFlash,
}: {
    state: ReturnType<typeof useResourcePack>;
    onFlash: (type: 'success' | 'error', message: string) => void;
}) => {
    const { pack, loading } = state;
    const [busy, setBusy] = useState(false);

    const run = async (work: () => Promise<void>, done: string) => {
        setBusy(true);
        try {
            await work();
            onFlash('success', done);
        } catch (e) {
            onFlash('error', (e as any)?.response ? httpErrorToHuman(e) : (e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <Spinner size={'large'} centered />;
    if (!pack) {
        return <EmptyState>No resource pack is set. Pick one from Browse.</EmptyState>;
    }

    return (
        <div css={tw`bg-white border border-neutral-500 rounded-xl shadow-md p-5`}>
            <div css={tw`flex flex-wrap items-center`}>
                <ProjectIcon src={pack.info?.icon || null} size={48} />
                <div css={tw`flex-1 min-w-0 mr-4`}>
                    <p css={tw`text-sm font-semibold text-neutral-50 truncate`}>
                        {pack.info?.title || 'Custom resource pack'}
                    </p>
                    <p css={tw`text-xs text-neutral-400 truncate`}>
                        {pack.info ? `${pack.info.versionNumber} · ` : ''}
                        <span css={tw`font-mono`}>{pack.url}</span>
                    </p>
                </div>
                <Button.Danger
                    variant={Button.Variants.Secondary}
                    size={Button.Sizes.Small}
                    disabled={busy}
                    onClick={() => run(state.remove, 'The resource pack was removed. Restart the server to apply it.')}
                >
                    <TrashIcon css={tw`w-4 h-4 mr-1.5 -ml-1`} />
                    Remove
                </Button.Danger>
            </div>
            <div css={tw`mt-4 pt-4 border-t border-neutral-500 flex items-center justify-between gap-4`}>
                <div>
                    <p css={tw`text-sm font-medium text-neutral-50`}>Require players to install it</p>
                    <p css={tw`text-xs text-neutral-400`}>
                        Players who decline are disconnected. Restart the server to apply.
                    </p>
                </div>
                <Switch
                    name={'require-resource-pack'}
                    readOnly={busy}
                    defaultChecked={pack.required}
                    onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        run(
                            () => state.setRequired(checked),
                            checked ? 'Players are now required to use it.' : 'Players can decline it now.'
                        );
                    }}
                />
            </div>
            <p css={tw`mt-3 text-xs text-neutral-400`}>
                Saved in server.properties as resource-pack, resource-pack-sha1 and require-resource-pack.
            </p>
        </div>
    );
};

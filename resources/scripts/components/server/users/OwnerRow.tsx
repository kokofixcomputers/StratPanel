import React from 'react';
import tw from 'twin.macro';
import { CubeIcon, LockClosedIcon, LockOpenIcon } from '@heroicons/react/outline';
import { Subuser } from '@/state/server/subusers';
import Sensitive from '@/components/elements/Sensitive';
import GreyRowBox from '@/components/elements/GreyRowBox';

/** The owner of the server at the top of the list. Their access is not a set of permissions, so there is nothing to edit or remove. */
export default ({ owner }: { owner: Subuser }) => (
    <GreyRowBox css={tw`mb-3`}>
        <div css={tw`w-10 h-10 rounded-full bg-white border-2 border-neutral-500 overflow-hidden hidden md:block`}>
            <img
                css={tw`w-full h-full`}
                src={owner.minecraft ? owner.image : `${owner.image}?s=400`}
                style={owner.minecraft ? { imageRendering: 'pixelated' } : undefined}
            />
        </div>
        <div css={tw`ml-4 flex-1 overflow-hidden`}>
            <p css={tw`text-sm font-medium text-neutral-50 truncate`}>
                <Sensitive>{owner.email}</Sensitive>
            </p>
            {owner.minecraft && (
                <p css={tw`mt-0.5 flex items-center gap-1 text-xs text-neutral-400 truncate`}>
                    <CubeIcon css={tw`w-3.5 h-3.5 flex-shrink-0 text-primary-600`} />
                    {owner.minecraft.username}
                </p>
            )}
        </div>
        <div css={tw`ml-4`}>
            <p css={tw`font-medium text-center`}>
                &nbsp;
                {owner.twoFactorEnabled ? (
                    <LockClosedIcon css={tw`w-5 h-5 inline text-green-600`} />
                ) : (
                    <LockOpenIcon css={tw`w-5 h-5 inline text-red-500`} />
                )}
                &nbsp;
            </p>
            <p css={tw`text-2xs text-neutral-400 uppercase tracking-wide hidden md:block`}>2FA Enabled</p>
        </div>
        <div css={tw`ml-4 hidden md:block`}>
            <p css={tw`font-medium text-center`}>All</p>
            <p css={tw`text-2xs text-neutral-400 uppercase tracking-wide`}>Permissions</p>
        </div>
        <span
            title={'The owner has full access and cannot be changed or removed here.'}
            css={tw`ml-4 mr-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700`}
        >
            Owner
        </span>
    </GreyRowBox>
);

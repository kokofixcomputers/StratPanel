import React from 'react';
import BoringAvatar, { AvatarProps } from 'boring-avatars';
import { useStoreState } from '@/state/hooks';

const palette = ['#FFAD08', '#EDD75A', '#73B06F', '#0C8F8F', '#587291'];

type Props = Omit<AvatarProps, 'colors'>;

const _Avatar = ({ variant = 'beam', ...props }: AvatarProps) => (
    <BoringAvatar colors={palette} variant={variant} {...props} />
);

const _UserAvatar = ({ variant = 'beam', ...props }: Omit<Props, 'name'>) => {
    const uuid = useStoreState((state) => state.user.data?.uuid);
    const head = useStoreState((state) => state.user.data?.minecraftAvatar);

    // A linked Minecraft account gives the skin head as the avatar.
    if (head) {
        return (
            <img
                src={head}
                alt={''}
                width={props.size}
                height={props.size}
                style={{ width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'cover' }}
            />
        );
    }

    return <BoringAvatar colors={palette} name={uuid || 'system'} variant={variant} {...props} />;
};

_Avatar.displayName = 'Avatar';
_UserAvatar.displayName = 'Avatar.User';

const Avatar = Object.assign(_Avatar, {
    User: _UserAvatar,
});

export default Avatar;

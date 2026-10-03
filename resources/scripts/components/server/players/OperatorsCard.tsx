import React from 'react';
import { ShieldCheckIcon } from '@heroicons/react/outline';
import PlayerListCard from '@/components/server/players/PlayerListCard';

export default () => (
    <PlayerListCard
        config={{
            file: '/ops.json',
            title: 'Operators',
            icon: <ShieldCheckIcon className={'w-6 h-6'} />,
            emptyText: 'No operators yet.',
            placeholder: 'Minecraft username',
            addCommand: (name) => `op ${name}`,
            removeCommand: (name) => `deop ${name}`,
            toEntry: () => ({ level: 4, bypassesPlayerLimit: false }),
            badge: (entry) => (entry.level ? `Level ${entry.level}` : null),
        }}
    />
);

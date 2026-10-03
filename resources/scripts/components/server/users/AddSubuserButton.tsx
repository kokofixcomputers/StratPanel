import React, { useState } from 'react';
import EditSubuserModal from '@/components/server/users/EditSubuserModal';
import { PlusIcon } from '@heroicons/react/solid';
import { Button } from '@/components/elements/button/index';

export default () => {
    const [visible, setVisible] = useState(false);

    return (
        <>
            <EditSubuserModal visible={visible} onModalDismissed={() => setVisible(false)} />
            <Button onClick={() => setVisible(true)}>
                <PlusIcon className={'w-4 h-4 mr-2 -ml-1'} />
                New User
            </Button>
        </>
    );
};

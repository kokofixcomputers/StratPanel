import React, { useEffect, useState } from 'react';
import tw from 'twin.macro';
import { Dialog } from '@/components/elements/dialog';
import { Button } from '@/components/elements/button/index';
import { Transport, TRANSPORTS } from '@/lib/geyser';

interface Props {
    open: boolean;
    current: Transport | null;
    // How many allocations can still be added.
    free: number;
    onClose: () => void;
    onApply: (transport: Transport) => void;
}

/** Asks how Bedrock players should connect to the server: that decides if Geyser needs one port or two. */
export default ({ open, current, free, onClose, onApply }: Props) => {
    const [transport, setTransport] = useState<Transport>('raknet');

    useEffect(() => {
        if (open) setTransport(current || 'raknet');
    }, [open]);

    const chosen = TRANSPORTS.find((t) => t.id === transport)!;
    const short = free < chosen.ports;

    return (
        <Dialog open={open} onClose={onClose} title={'Geyser: how Bedrock players connect'}>
            <p css={tw`text-sm text-neutral-300 mb-3`}>
                Geyser lets Bedrock players join this Java server. New allocations are added for the ports and set in
                the config of Geyser.
            </p>
            <div css={tw`space-y-2`}>
                {TRANSPORTS.map((t) => (
                    <label
                        key={t.id}
                        css={[
                            tw`flex items-start p-3 rounded border cursor-pointer`,
                            t.id === transport ? tw`border-primary-400 bg-neutral-700` : tw`border-neutral-600`,
                        ]}
                    >
                        <input
                            type={'radio'}
                            name={'geyser-transport'}
                            checked={t.id === transport}
                            onChange={() => setTransport(t.id)}
                            css={tw`mt-1 mr-3`}
                        />
                        <span>
                            <span css={tw`block text-sm text-neutral-100`}>
                                {t.name}
                                <span css={tw`ml-2 text-xs text-neutral-400`}>
                                    {t.ports} port{t.ports === 1 ? '' : 's'}
                                </span>
                            </span>
                            <span css={tw`block text-xs text-neutral-400 mt-1`}>{t.description}</span>
                        </span>
                    </label>
                ))}
            </div>
            {short && (
                <p css={tw`text-sm text-red-400 mt-3`}>
                    This needs {chosen.ports} free allocations and the server can add {free} more.
                </p>
            )}
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={short} onClick={() => onApply(transport)}>
                    Add {chosen.ports} port{chosen.ports === 1 ? '' : 's'} and apply
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
};

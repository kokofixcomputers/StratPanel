import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CogIcon, KeyIcon } from '@heroicons/react/solid';
import NodeFrame from '@/components/admin/pages/nodes/NodeFrame';
import CopyOnClick from '@/components/elements/CopyOnClick';
import SectionCard from '@/components/elements/SectionCard';
import Spinner from '@/components/elements/Spinner';
import { Button } from '@/components/elements/button/index';
import { Dialog } from '@/components/elements/dialog';
import useFlash from '@/plugins/useFlash';
import { createDeployToken, useNode, useNodeConfiguration } from '@/api/admin/nodes';

/** Admin > Nodes > one node > Configuration: the file Wings is set up with, and a command that does it on a new machine. */
export default () => {
    const { id } = useParams<{ id: string }>();
    const { data: node } = useNode(id);
    const { data, error } = useNodeConfiguration(id);
    const { clearFlashes, clearAndAddHttpError } = useFlash();
    const [token, setToken] = useState<{ node: number; token: string } | null>(null);

    if (!node || !data) return error ? null : <Spinner size={'large'} centered />;

    const generate = () => {
        clearFlashes('admin');
        createDeployToken(node.id)
            .then(setToken)
            .catch((e) => clearAndAddHttpError({ key: 'admin', error: e }));
    };

    const install = token && `sudo wings install ${data.panel_url} ${token.token} ${token.node}`;
    const configure =
        token &&
        `cd /etc/pterodactyl && sudo wings configure --panel-url ${data.panel_url} --token ${token.token} --node ${
            token.node
        }${data.insecure ? ' --allow-insecure' : ''}`;

    return (
        <NodeFrame id={node.id} name={node.name} subtitle={'The configuration file of Wings on this node.'}>
            <div className={'grid gap-4 lg:grid-cols-3'}>
                <SectionCard
                    className={'lg:col-span-2'}
                    icon={<CogIcon className={'h-5 w-5'} />}
                    title={'Configuration file'}
                >
                    <CopyOnClick text={data.yaml}>
                        <pre className={'max-h-[32rem] overflow-auto rounded-lg bg-neutral-700 p-3 text-xs'}>
                            {data.yaml}
                        </pre>
                    </CopyOnClick>
                    <p className={'mt-3 text-sm text-neutral-300'}>
                        This file should be placed in the root directory of Wings (usually <code>/etc/pterodactyl</code>
                        ) in a file called <code>config.yml</code>.
                    </p>
                </SectionCard>
                <SectionCard icon={<KeyIcon className={'h-5 w-5'} />} title={'Auto-deploy'}>
                    <p className={'mb-4 text-sm text-neutral-200'}>
                        Generate a deployment command that configures Wings on the target machine with a single command.
                    </p>
                    <Button onClick={generate}>Generate token</Button>
                </SectionCard>
            </div>
            <Dialog open={!!token} onClose={() => setToken(null)} title={'Token created'}>
                <p className={'mb-2 text-sm text-neutral-200'}>
                    On a new machine, with the Wings of Stratosphere in place (see docs/updates.md), this does
                    everything, including the service:
                </p>
                <CopyOnClick text={install ?? ''}>
                    <pre
                        className={
                            'mb-4 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-700 p-3 text-xs'
                        }
                    >
                        {install}
                    </pre>
                </CopyOnClick>
                <p className={'mb-2 text-sm text-neutral-200'}>To only write the configuration:</p>
                <CopyOnClick text={configure ?? ''}>
                    <pre
                        className={
                            'overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-neutral-700 p-3 text-xs'
                        }
                    >
                        {configure}
                    </pre>
                </CopyOnClick>
                <Dialog.Footer>
                    <Button onClick={() => setToken(null)}>Close</Button>
                </Dialog.Footer>
            </Dialog>
        </NodeFrame>
    );
};

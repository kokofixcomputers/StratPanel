import React from 'react';
import Slider from '@/components/elements/Slider';
import { Share, shareText } from '@/lib/store';

/**
 * The six sliders of a share of a box: how much of memory, disk, CPU, ports, backups and databases a server gets. `max` is what the box
 * has left for it (counting what the server has already, when it is changed), `min` the least a server can have.
 */
export default ({
    value,
    max,
    min,
    onChange,
}: {
    value: Share;
    max: Share;
    min: Share;
    onChange: (value: Share) => void;
}) => {
    const set = (key: keyof Share) => (next: number) => onChange({ ...value, [key]: next });
    const at = (key: keyof Share) => Math.max(min[key], max[key]);

    return (
        <div className={'space-y-5'}>
            <Slider
                label={'Memory'}
                value={value.memory}
                min={min.memory}
                max={at('memory')}
                step={256}
                display={shareText('memory', value.memory)}
                hint={`up to ${shareText('memory', at('memory'))}`}
                onChange={set('memory')}
            />
            <Slider
                label={'Disk'}
                value={value.disk}
                min={min.disk}
                max={at('disk')}
                step={1024}
                display={shareText('disk', value.disk)}
                hint={`up to ${shareText('disk', at('disk'))}`}
                onChange={set('disk')}
            />
            <Slider
                label={'CPU'}
                value={value.cpu}
                min={min.cpu}
                max={at('cpu')}
                step={50}
                display={`${value.cpu}% (${(value.cpu / 100).toFixed(1)} cores)`}
                hint={`up to ${at('cpu')}%, 100% is one core`}
                onChange={set('cpu')}
            />
            <Slider
                label={'Ports'}
                value={value.allocations}
                min={min.allocations}
                max={at('allocations')}
                step={1}
                display={String(value.allocations)}
                hint={`up to ${at('allocations')}`}
                onChange={set('allocations')}
            />
            <Slider
                label={'Backups'}
                value={value.backups}
                min={min.backups}
                max={at('backups')}
                step={1}
                display={String(value.backups)}
                hint={`up to ${at('backups')}`}
                onChange={set('backups')}
            />
            <Slider
                label={'Databases'}
                value={value.databases}
                min={min.databases}
                max={at('databases')}
                step={1}
                display={String(value.databases)}
                hint={`up to ${at('databases')}`}
                onChange={set('databases')}
            />
        </div>
    );
};

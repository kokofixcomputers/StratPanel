import { Interpretation, interpret } from '@/lib/nlu';
import { hasPermission, IconKey, ListedServer, PaletteItem } from '@/lib/palette';
import { PowerSignal } from '@/api/server/sendPowerAction';

export interface NlActions {
    power: (uuid: string, signal: PowerSignal) => Promise<unknown>;
    backup: (uuid: string, name: string) => Promise<unknown>;
    command: (uuid: string, command: string) => Promise<unknown>;
    theme: (mode: 'dark' | 'light' | 'toggle') => void;
}

export interface NlContext {
    servers: ListedServer[];
    // The server that is open, with what the person may do on it.
    current: { server: ListedServer; permissions: string[] } | null;
}

const VERB: Record<PowerSignal, { label: string; done: string; icon: IconKey }> = {
    start: { label: 'Start', done: 'Start sent to', icon: 'play' },
    restart: { label: 'Restart', done: 'Restart sent to', icon: 'restart' },
    stop: { label: 'Stop', done: 'Stop sent to', icon: 'stop' },
    kill: { label: 'Kill', done: 'Kill sent to', icon: 'kill' },
};

const item = (id: string, label: string, icon: IconKey, action: PaletteItem['action']): PaletteItem => ({
    id: `nl:${id}`,
    label,
    hint: 'Understood',
    group: 'Suggested',
    icon,
    always: true,
    action,
});

/** Whether the person may do this on that server, as far as the panel knows (it only knows for the one that is open). */
const allowed = (context: NlContext, server: ListedServer, permission: string): boolean => {
    if (context.current && context.current.server.uuid === server.uuid)
        return hasPermission(context.current.permissions, permission);

    return true;
};

/** The suggestions for what was typed, understood as a request: each one is something that can be done with Enter. */
export const nlItems = (query: string, context: NlContext, actions: NlActions): PaletteItem[] => {
    const result: Interpretation | null = interpret(query, {
        servers: context.servers,
        current: context.current?.server ?? null,
    });
    if (!result) return [];
    const listed = result.servers as ListedServer[];
    const items: PaletteItem[] = [];

    switch (result.intent) {
        case 'start':
        case 'stop':
        case 'restart':
        case 'kill': {
            const signal = result.signal as PowerSignal;
            const verb = VERB[signal];
            const control = signal === 'kill' ? 'stop' : signal;
            listed
                .filter((s) => s.canControl[control] && allowed(context, s, `control.${control}`))
                .forEach((s) =>
                    items.push(
                        item(`${signal}:${s.uuid}`, `${verb.label} ${s.name}`, verb.icon, {
                            type: 'run',
                            run: async () => {
                                await actions.power(s.uuid, signal);

                                return `${verb.done} ${s.name}`;
                            },
                        })
                    )
                );
            break;
        }
        case 'backup':
            listed
                .filter((s) => allowed(context, s, 'backup.create'))
                .forEach((s) => {
                    const name = result.backupName || '';
                    items.push(
                        item(
                            `backup:${s.uuid}`,
                            name ? `Back up ${s.name} as “${name}”` : `Back up ${s.name}`,
                            'backup',
                            {
                                type: 'run',
                                run: async () => {
                                    await actions.backup(s.uuid, name);

                                    return `Backup of ${s.name} started`;
                                },
                            }
                        )
                    );
                });
            break;
        case 'command':
            listed
                .filter((s) => allowed(context, s, 'control.console'))
                .forEach((s) =>
                    items.push(
                        item(`command:${s.uuid}`, `Run “${result.command}” on ${s.name}`, 'console', {
                            type: 'run',
                            run: async () => {
                                await actions.command(s.uuid, result.command as string);

                                return `Sent “${result.command}” to ${s.name}`;
                            },
                        })
                    )
                );
            break;
        case 'page':
            listed.forEach((s) =>
                items.push(
                    item(`page:${s.uuid}`, `Open ${result.page!.name} of ${s.name}`, 'page', {
                        type: 'go',
                        to: `/server/${s.id}${result.page!.path === '/' ? '' : result.page!.path}`,
                    })
                )
            );
            break;
        case 'open':
            listed.forEach((s) =>
                items.push(item(`open:${s.uuid}`, `Open ${s.name}`, 'server', { type: 'go', to: `/server/${s.id}` }))
            );
            break;
        case 'site':
            items.push(item('site', `Open ${result.site!.name}`, 'user', { type: 'go', to: result.site!.path }));
            break;
        case 'theme': {
            const mode = result.mode ?? 'toggle';
            items.push(
                item('theme', mode === 'toggle' ? 'Switch the theme' : `Use the ${mode} theme`, 'theme', {
                    type: 'run',
                    run: async () => actions.theme(mode),
                })
            );
            break;
        }
    }

    return items;
};

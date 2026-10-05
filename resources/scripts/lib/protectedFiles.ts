/** Files the panel keeps on a server for its own features, deleting them has consequences the user should know about. */

export interface ProtectedFile {
    name: string;
    consequence: string;
}

const RULES: { match: (directory: string, name: string) => boolean; consequence: string }[] = [
    {
        match: (directory, name) => directory === '/' && /^(pterodactyl\.json|\.panel-version\.json)$/i.test(name),
        consequence:
            'It remembers which software, mods, plugins, modpack and resource pack the panel installed. Without it the ' +
            'panel can no longer update or uninstall them, and no longer knows which version of the software is installed.',
    },
    {
        match: (directory, name) => directory === '/' && /^pterodactyl\.commands\.json(\.tmp)?$/i.test(name),
        consequence:
            'It is the command list used for tab completion. Completion falls back to the built in commands until the ' +
            'helper plugin writes it again.',
    },
    {
        match: (directory, name) => directory === '/plugins' && /^stratpanel(\.jar|[-_.].*\.jar)?$/i.test(name),
        consequence:
            'It is the helper plugin: without it there is no command completion from your plugins, no reliable player list ' +
            'and no helper status on the console.',
    },
];

/** The files among the given names (all in one directory) that belong to the panel, with what deleting them costs. */
export const protectedFiles = (directory: string, names: string[]): ProtectedFile[] => {
    const normal = `/${directory.replace(/^\/+|\/+$/g, '')}`;

    return names.flatMap((name) => {
        const rule = RULES.find((r) => r.match(normal, name));

        return rule ? [{ name, consequence: rule.consequence }] : [];
    });
};

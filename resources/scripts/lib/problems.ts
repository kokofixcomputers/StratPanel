/**
 * Finds the known causes of trouble in what a server printed, and says what to do about each. Every rule is a pattern of
 * something Minecraft, Java, a loader or Wings prints, with the explanation and the fixes that go with it. Nothing here
 * guesses: a problem is only reported when a line of the log says it.
 */

export type Fix =
    // Writes eula=true to eula.txt.
    | { type: 'eula'; label: string }
    // Changes lines of server.properties.
    | { type: 'properties'; values: Record<string, string>; label: string }
    // Goes to a page of the server, such as '/versions' or '/mods?t=plugin&q=vault'.
    | { type: 'link'; to: string; label: string }
    // Picks the Java image of the egg that has this major version of Java.
    | { type: 'java'; major: number; label: string };

export interface Problem {
    id: string;
    severity: 'error' | 'warning';
    title: string;
    detail: string;
    // The lines of the log that show it, at most a few.
    evidence: string[];
    // How many times it was printed.
    count: number;
    fixes: Fix[];
}

export interface ProblemContext {
    // The port of the allocation the server was given, null when not known.
    port: number | null;
}

// Where a run of the server starts in the console, and what it prints once it is up.
const STARTING = /Server marked as starting/;
const STARTED = /\bDone \(\d+(?:[.,]\d+)?s\)! For help, type "help"/;

interface Hit {
    index: number;
    line: string;
    match: RegExpExecArray;
}

const hits = (lines: string[], pattern: RegExp): Hit[] => {
    const found: Hit[] = [];
    lines.forEach((line, index) => {
        const match = pattern.exec(line);
        if (match) found.push({ index, line: line.trim().slice(0, 220), match });
    });

    return found;
};

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

/** The folder-relative path of a file a log line names, "/home/container/./plugins/A/config.yml" is "plugins/A/config.yml". */
export const relativePath = (path: string): string =>
    path
        .replace(/^\/home\/container\//, '')
        .replace(/^\.\//, '')
        .replace(/\/\.\//g, '/')
        .replace(/^\/+/, '');

/** The Java image of an egg for a major version of Java: the one with java_21, java:21 or java-21 in its name. */
export const imageForJava = (images: Record<string, string>, major: number): string | null => {
    const pattern = new RegExp(`java[_:-]?${major}(?!\\d)`, 'i');

    return Object.values(images).find((image) => pattern.test(image)) || null;
};

/** The version of Java a class file version needs: 61 is 17, 65 is 21. */
export const javaForClassVersion = (classVersion: number): number => classVersion - 44;

interface Rule {
    id: string;
    // A startup problem is over when the server printed that it is up after it, one while it runs is not.
    phase: 'startup' | 'runtime';
    check: (
        lines: string[],
        context: ProblemContext
    ) => { hits: Hit[]; problem: Omit<Problem, 'id' | 'evidence' | 'count'> } | null;
}

const searchTo = (kind: 'mod' | 'plugin', name: string): Fix => ({
    type: 'link',
    to: `/mods?t=${kind}&q=${encodeURIComponent(name)}`,
    label: `Find ${name}`,
});

const RULES: Rule[] = [
    {
        id: 'eula',
        phase: 'startup',
        check: (lines) => {
            const found = hits(lines, /You need to agree to the EULA in order to run the server/i);

            return found.length
                ? {
                      hits: found,
                      problem: {
                          severity: 'error',
                          title: 'The Minecraft EULA has not been accepted',
                          detail: 'The server does not start until the EULA (eula.txt) says eula=true.',
                          fixes: [{ type: 'eula', label: 'Accept the EULA' }],
                      },
                  }
                : null;
        },
    },
    {
        id: 'port',
        phase: 'startup',
        check: (lines, context) => {
            const found = hits(
                lines,
                /FAILED TO BIND TO PORT|java\.net\.BindException: Address already in use|Failed to bind to port|Perhaps a server is already running on that port/i
            );
            if (!found.length) return null;
            const port = context.port;

            return {
                hits: found,
                problem: {
                    severity: 'error',
                    title: 'The server could not use its port',
                    detail: port
                        ? `This server was given port ${port}. server.properties has to use exactly that port, and nothing else may be using it.`
                        : 'server.properties has to use the port this server was given, and nothing else may be using it.',
                    fixes: port
                        ? [
                              {
                                  type: 'properties',
                                  values: { 'server-port': String(port) },
                                  label: `Set server-port to ${port}`,
                              },
                              { type: 'link', to: '/network', label: 'Open Network' },
                          ]
                        : [{ type: 'link', to: '/network', label: 'Open Network' }],
                },
            };
        },
    },
    {
        id: 'java',
        phase: 'startup',
        check: (lines) => {
            const classFile = hits(lines, /UnsupportedClassVersionError.*?class file version (\d+)\.\d+/);
            const loader = hits(lines, /requires (?:version )?(\d+)(?: or later)? of java/i);
            const found = [...classFile, ...loader];
            if (!found.length) return null;
            const needed = Math.max(
                ...classFile.map((hit) => javaForClassVersion(parseInt(hit.match[1], 10))),
                ...loader.map((hit) => parseInt(hit.match[1], 10))
            );

            return {
                hits: found,
                problem: {
                    severity: 'error',
                    title: `This needs Java ${needed}, the server runs an older one`,
                    detail: `Something the server loads was built for Java ${needed} or newer than the Java image this server uses.`,
                    fixes: [{ type: 'java', major: needed, label: `Switch to Java ${needed}` }],
                },
            };
        },
    },
    {
        id: 'memory',
        phase: 'runtime',
        check: (lines) => {
            const found = hits(
                lines,
                /java\.lang\.OutOfMemoryError|There is insufficient memory for the Java Runtime Environment|Out of memory: true/i
            );

            return found.length
                ? {
                      hits: found,
                      problem: {
                          severity: 'error',
                          title: 'The server ran out of memory',
                          detail: 'Less view distance and fewer loaded chunks help the most. If it keeps happening, a mod or plugin may use too much, or the server needs more memory than it was given, which your host can change.',
                          fixes: [
                              {
                                  type: 'properties',
                                  values: { 'view-distance': '8', 'simulation-distance': '6' },
                                  label: 'Lower the view distance',
                              },
                          ],
                      },
                  }
                : null;
        },
    },
    {
        id: 'mod-dependency',
        phase: 'startup',
        check: (lines) => {
            const found = hits(
                lines,
                /Mod '([^']+)' \(([^)]+)\) \S+ requires (?:any version|version [^,]+?) of ([\w.-]+), which is missing!/
            );
            if (!found.length) return null;
            const missing = unique(found.map((hit) => hit.match[3]));

            return {
                hits: found,
                problem: {
                    severity: 'error',
                    title: `${missing.length === 1 ? 'A mod is' : 'Mods are'} missing: ${missing.join(', ')}`,
                    detail: `${unique(found.map((hit) => hit.match[1])).join(', ')} need${
                        found.length === 1 ? 's' : ''
                    } ${missing.length === 1 ? 'it' : 'them'} to load. Install ${
                        missing.length === 1 ? 'it' : 'them'
                    } and start the server again.`,
                    fixes: missing.slice(0, 3).map((name) => searchTo('mod', name)),
                },
            };
        },
    },
    {
        id: 'plugin-dependency',
        phase: 'startup',
        check: (lines) => {
            const unknown = hits(lines, /UnknownDependencyException: (.+)$/);
            const listed = hits(lines, /Unknown\/missing dependency plugins: \[([^\]]+)\]/);
            const found = [...unknown, ...listed];
            if (!found.length) return null;
            const missing = unique([
                ...unknown.map((hit) => hit.match[1].trim()),
                ...listed.flatMap((hit) => hit.match[1].split(',').map((name) => name.trim())),
            ]).filter((name) => /^[\w .-]{1,40}$/.test(name));
            if (!missing.length) return null;

            return {
                hits: found,
                problem: {
                    severity: 'error',
                    title: `${missing.length === 1 ? 'A plugin is' : 'Plugins are'} missing: ${missing.join(', ')}`,
                    detail: 'Another plugin needs this to load. Install it and restart the server.',
                    fixes: missing.slice(0, 3).map((name) => searchTo('plugin', name)),
                },
            };
        },
    },
    {
        id: 'plugin-api',
        phase: 'startup',
        check: (lines) => {
            const found = hits(lines, /Unsupported API version (\d+(?:\.\d+)*)/);

            return found.length
                ? {
                      hits: found,
                      problem: {
                          severity: 'error',
                          title: `A plugin needs a newer Minecraft (${found[0].match[1]})`,
                          detail: 'It was made for a newer version of the game than this server runs, so it does not load.',
                          fixes: [{ type: 'link', to: '/versions', label: 'Update the server' }],
                      },
                  }
                : null;
        },
    },
    {
        id: 'jar',
        phase: 'startup',
        check: (lines) => {
            const found = hits(lines, /Unable to access jarfile (\S+)|Invalid or corrupt jarfile (\S+)/);

            return found.length
                ? {
                      hits: found,
                      problem: {
                          severity: 'error',
                          title: `The server jar is missing or damaged (${found[0].match[1] || found[0].match[2]})`,
                          detail: 'There is no usable server file under that name. Installing the server software again puts one there.',
                          fixes: [{ type: 'link', to: '/versions', label: 'Install the server software' }],
                      },
                  }
                : null;
        },
    },
    {
        id: 'config',
        phase: 'startup',
        check: (lines) => {
            const found = hits(lines, /Cannot load (?:\/home\/container\/)?(\S+\.ya?ml)/);
            if (!found.length) return null;
            const file = relativePath(found[0].match[1]);

            return {
                hits: found,
                problem: {
                    severity: 'error',
                    title: `A plugin could not read its config (${file})`,
                    detail: 'The file has a mistake in it, such as a wrong indent or a missing quote. Open it and fix the line the error names.',
                    fixes: [{ type: 'link', to: `/files/edit#/${file}`, label: 'Open the file' }],
                },
            };
        },
    },
    {
        id: 'crash',
        phase: 'runtime',
        check: (lines) => {
            const found = hits(lines, /This crash report has been saved to: (\S+\.txt)/);
            if (!found.length) return null;
            const file = relativePath(found[found.length - 1].match[1]);
            const description = hits(lines, /^\s*Description: (.+)$/).pop();

            return {
                hits: found,
                problem: {
                    severity: 'error',
                    title: 'The server crashed',
                    detail: description
                        ? `Minecraft says: ${description.match[1].trim()}. The crash report has the details.`
                        : 'The crash report has the details.',
                    fixes: [{ type: 'link', to: `/files/edit#/${file}`, label: 'Open the crash report' }],
                },
            };
        },
    },
    {
        id: 'lag',
        phase: 'runtime',
        check: (lines) => {
            const found = hits(
                lines,
                /Can't keep up! Is the server overloaded\? Running (\d+)ms or (\d+) ticks? behind/
            );
            if (!found.length) return null;

            return {
                hits: found,
                problem: {
                    severity: 'warning',
                    title: 'The server is falling behind',
                    detail: `A tick took longer than 50 ms, at worst ${Math.max(
                        ...found.map((hit) => parseInt(hit.match[1], 10))
                    )} ms behind. Less view distance, fewer entities and lighter plugins help.`,
                    fixes: [{ type: 'link', to: '/properties', label: 'Open Properties' }],
                },
            };
        },
    },
];

/**
 * The problems in the lines of one run of the server. Only the lines after the last time the server started count, so what a
 * fixed problem printed before is not shown again, and a startup problem is not shown once the server printed that it is up.
 */
export const analyze = (all: string[], context: ProblemContext): Problem[] => {
    let from = 0;
    all.forEach((line, index) => {
        if (STARTING.test(line)) from = index;
    });
    const lines = all.slice(from);
    let upAt = -1;
    lines.forEach((line, index) => {
        if (STARTED.test(line)) upAt = index;
    });

    const problems: Problem[] = [];
    RULES.forEach((rule) => {
        const result = rule.check(lines, context);
        if (!result) return;
        // A problem of starting that the server got past is over.
        if (rule.phase === 'startup' && upAt > Math.max(...result.hits.map((hit) => hit.index))) return;

        problems.push({
            id: rule.id,
            ...result.problem,
            evidence: unique(result.hits.map((hit) => hit.line)).slice(-3),
            count: result.hits.length,
        });
    });

    return problems.sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
};

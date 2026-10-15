import { analyze, imageForJava, javaForClassVersion, relativePath } from '@/lib/problems';

const ctx = { port: 25577 };
const ids = (lines: string[], context = ctx) => analyze(lines, context).map((p) => p.id);

const NORMAL = [
    'container@pterodactyl~ Server marked as starting...',
    '[19:36:37] [main/INFO]: Loading Minecraft 1.21.4 with Fabric Loader 0.16.9',
    '[19:36:41] [Server thread/INFO]: Starting minecraft server version 1.21.4',
    '[19:36:44] [Server thread/INFO]: Done (3.412s)! For help, type "help"',
    '[19:40:02] [Server thread/INFO]: Steve joined the game',
];

describe('a server that is fine', () => {
    it('has no problems', () => {
        expect(analyze(NORMAL, ctx)).toEqual([]);
        expect(analyze([], ctx)).toEqual([]);
    });
});

describe('the EULA', () => {
    it('is found, with a button that accepts it', () => {
        const [problem] = analyze(
            [
                'container@pterodactyl~ Server marked as starting...',
                '[11:00:00] [ServerMain/WARN]: You need to agree to the EULA in order to run the server. Go to eula.txt for more info.',
            ],
            ctx
        );

        expect(problem).toMatchObject({ id: 'eula', severity: 'error' });
        expect(problem.fixes).toEqual([{ type: 'eula', label: 'Accept the EULA' }]);
        expect(problem.evidence[0]).toContain('EULA');
    });
});

describe('the port', () => {
    const lines = [
        '[11:00:01] [Server thread/ERROR]: **** FAILED TO BIND TO PORT!',
        '[11:00:01] [Server thread/WARN]: The exception was: java.net.BindException: Address already in use',
        '[11:00:01] [Server thread/WARN]: Perhaps a server is already running on that port?',
    ];

    it('offers to set the port the server was given', () => {
        const [problem] = analyze(lines, ctx);

        expect(problem.id).toBe('port');
        expect(problem.detail).toContain('25577');
        expect(problem.fixes[0]).toEqual({
            type: 'properties',
            values: { 'server-port': '25577' },
            label: 'Set server-port to 25577',
        });
        expect(problem.count).toBe(3);
    });

    it('only points to the network page when the port is not known', () => {
        expect(analyze(lines, { port: null })[0].fixes).toEqual([
            { type: 'link', to: '/network', label: 'Open Network' },
        ]);
    });
});

describe('Java', () => {
    it('finds the Java a class file needs', () => {
        const [problem] = analyze(
            [
                'Error: LinkageError occurred while loading main class net.minecraft.bundler.Main',
                'java.lang.UnsupportedClassVersionError: net/minecraft/bundler/Main has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 61.0',
            ],
            ctx
        );

        expect(problem.id).toBe('java');
        expect(problem.title).toContain('Java 21');
        expect(problem.fixes).toEqual([{ type: 'java', major: 21, label: 'Switch to Java 21' }]);
    });

    it('finds what a loader says it needs', () => {
        const [problem] = analyze(
            ["Mod 'Sodium' (sodium) 0.6.0 requires version 21 or later of java, which is missing!"],
            ctx
        );

        expect(problem.id).toBe('java');
        expect(problem.fixes[0]).toMatchObject({ type: 'java', major: 21 });
    });

    it('takes the newest when there are several', () => {
        const lines = [
            'java.lang.UnsupportedClassVersionError: a/B (class file version 61.0), this version of the Java Runtime only recognizes class file versions up to 52.0',
            'java.lang.UnsupportedClassVersionError: c/D (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 52.0',
        ];

        expect(analyze(lines, ctx)[0].fixes[0]).toMatchObject({ major: 21 });
    });

    it('knows the Java of a class file version', () => {
        expect(javaForClassVersion(52)).toBe(8);
        expect(javaForClassVersion(61)).toBe(17);
        expect(javaForClassVersion(65)).toBe(21);
        expect(javaForClassVersion(69)).toBe(25);
    });

    it('picks the image of the egg for a version of Java', () => {
        const images = {
            'Java 8': 'ghcr.io/pterodactyl/yolks:java_8',
            'Java 17': 'ghcr.io/pterodactyl/yolks:java_17',
            'Java 21': 'ghcr.io/pterodactyl/yolks:java_21',
        };

        expect(imageForJava(images, 21)).toBe('ghcr.io/pterodactyl/yolks:java_21');
        expect(imageForJava(images, 17)).toBe('ghcr.io/pterodactyl/yolks:java_17');
        // java_2 must not match java_21, and java_21 must not match 2.
        expect(imageForJava(images, 2)).toBeNull();
        expect(imageForJava(images, 25)).toBeNull();
        expect(imageForJava({ a: 'eclipse-temurin:21' }, 21)).toBeNull();
    });
});

describe('memory', () => {
    it('finds the Java error and the message of the daemon', () => {
        expect(ids(['Exception in thread "Server thread" java.lang.OutOfMemoryError: Java heap space'])).toEqual([
            'memory',
        ]);
        expect(ids(['[Pterodactyl Daemon]: Exit code: 137', '[Pterodactyl Daemon]: Out of memory: true'])).toEqual([
            'memory',
        ]);
        expect(analyze(['java.lang.OutOfMemoryError: Java heap space'], ctx)[0].fixes[0]).toMatchObject({
            type: 'properties',
            values: { 'view-distance': '8', 'simulation-distance': '6' },
        });
    });
});

describe('missing mods', () => {
    const lines = [
        'net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible with the game or each other!',
        "Mod 'Sodium Extra' (sodium-extra) 0.5.4 requires any version of sodium, which is missing!",
        "Mod 'Mod Menu' (modmenu) 9.0.0 requires version 0.100.0 or later of fabric-api, which is missing!",
        "Mod 'Other' (other) 1.0.0 requires any version of fabric-api, which is missing!",
    ];

    it('lists each missing mod once, with a search for it', () => {
        const [problem] = analyze(lines, ctx);

        expect(problem.id).toBe('mod-dependency');
        expect(problem.title).toBe('Mods are missing: sodium, fabric-api');
        expect(problem.fixes).toEqual([
            { type: 'link', to: '/mods?t=mod&q=sodium', label: 'Find sodium' },
            { type: 'link', to: '/mods?t=mod&q=fabric-api', label: 'Find fabric-api' },
        ]);
        expect(problem.count).toBe(3);
    });

    it('does not report a mod that only recommends another', () => {
        expect(
            ids([
                "Mod 'Forge Config API Port' (forgeconfigapiport) 26.3.1 recommends any version of modmenu, which is missing!",
            ])
        ).toEqual([]);
    });
});

describe('missing plugins', () => {
    it('finds the plugin another one needs', () => {
        const [problem] = analyze(
            [
                "[11:00:02] [Server thread/ERROR]: Could not load 'plugins/Shops.jar' in folder 'plugins'",
                'org.bukkit.plugin.UnknownDependencyException: Vault',
            ],
            ctx
        );

        expect(problem.id).toBe('plugin-dependency');
        expect(problem.title).toBe('A plugin is missing: Vault');
        expect(problem.fixes).toEqual([{ type: 'link', to: '/mods?t=plugin&q=Vault', label: 'Find Vault' }]);
    });

    it('reads the list Paper prints', () => {
        const [problem] = analyze(
            [
                "[11:00:02] [Server thread/ERROR]: Unknown/missing dependency plugins: [Vault, WorldEdit]. Please download and install these plugins to run 'Shops'.",
            ],
            ctx
        );

        expect(problem.title).toBe('Plugins are missing: Vault, WorldEdit');
    });
});

describe('other causes', () => {
    it('a plugin made for a newer game', () => {
        expect(
            analyze(['org.bukkit.plugin.InvalidPluginException: Unsupported API version 1.22'], ctx)[0]
        ).toMatchObject({
            id: 'plugin-api',
            fixes: [{ type: 'link', to: '/versions', label: 'Update the server' }],
        });
    });

    it('a server jar that is not there', () => {
        expect(analyze(['Error: Unable to access jarfile server.jar'], ctx)[0].title).toContain('server.jar');
        expect(ids(['Error: Invalid or corrupt jarfile server.jar'])).toEqual(['jar']);
    });

    it('a config that does not read, with the file to open', () => {
        const [problem] = analyze(
            [
                'org.bukkit.configuration.InvalidConfigurationException: while scanning a simple key',
                'Cannot load /home/container/plugins/Shops/config.yml',
            ],
            ctx
        );

        expect(problem.id).toBe('config');
        expect(problem.fixes).toEqual([
            { type: 'link', to: '/files/edit#/plugins/Shops/config.yml', label: 'Open the file' },
        ]);
    });

    it('a crash, with the report to open', () => {
        const [problem] = analyze(
            [
                'Description: Exception in server tick loop',
                '[11:00:09] [Server thread/ERROR]: This crash report has been saved to: /home/container/./crash-reports/crash-2026-10-15_11.00.09-server.txt',
            ],
            ctx
        );

        expect(problem.id).toBe('crash');
        expect(problem.detail).toContain('Exception in server tick loop');
        expect(problem.fixes[0]).toEqual({
            type: 'link',
            to: '/files/edit#/crash-reports/crash-2026-10-15_11.00.09-server.txt',
            label: 'Open the crash report',
        });
    });

    it('lag is a warning, and counted', () => {
        const [problem] = analyze(
            [
                "[11:05:00] [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 2300ms or 46 ticks behind",
                "[11:06:00] [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 5100ms or 102 ticks behind",
            ],
            ctx
        );

        expect(problem).toMatchObject({ id: 'lag', severity: 'warning', count: 2 });
        expect(problem.detail).toContain('5100 ms');
    });

    it('lists errors before warnings', () => {
        const lines = [
            "[11:05:00] [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 2300ms or 46 ticks behind",
            'java.lang.OutOfMemoryError: Java heap space',
        ];

        expect(ids(lines)).toEqual(['memory', 'lag']);
    });
});

describe('what counts', () => {
    it('only the lines of the last run of the server', () => {
        const lines = [
            'container@pterodactyl~ Server marked as starting...',
            '[10:00:00] [ServerMain/WARN]: You need to agree to the EULA in order to run the server.',
            'container@pterodactyl~ Server marked as offline...',
            'container@pterodactyl~ Server marked as starting...',
            '[10:05:00] [main/INFO]: Starting up',
        ];

        expect(ids(lines)).toEqual([]);
    });

    it('a problem of starting is over once the server is up', () => {
        const lines = [
            'container@pterodactyl~ Server marked as starting...',
            "Mod 'A' (a) 1.0 requires any version of b, which is missing!",
            '[10:00:09] [Server thread/INFO]: Done (4.2s)! For help, type "help"',
        ];

        expect(ids(lines)).toEqual([]);
        // The same line after it is a new problem.
        expect(ids([...lines, "Mod 'A' (a) 1.0 requires any version of b, which is missing!"])).toEqual([
            'mod-dependency',
        ]);
    });

    it('a problem while it runs stays after the server is up', () => {
        const lines = [
            'container@pterodactyl~ Server marked as starting...',
            '[10:00:09] [Server thread/INFO]: Done (4.2s)! For help, type "help"',
            "[10:09:00] [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 2300ms or 46 ticks behind",
        ];

        expect(ids(lines)).toEqual(['lag']);
    });

    it('with the whole log when it never says the server started', () => {
        expect(ids(['Error: Unable to access jarfile server.jar'])).toEqual(['jar']);
    });

    it('shows at most three lines of evidence, each once', () => {
        const same =
            "[11:00:00] [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 2300ms or 46 ticks behind";
        const [problem] = analyze(Array(10).fill(same), ctx);

        expect(problem.evidence).toEqual([same]);
        expect(problem.count).toBe(10);
    });
});

describe('relativePath', () => {
    it('turns a path of the container into one of the file manager', () => {
        expect(relativePath('/home/container/./plugins/A/config.yml')).toBe('plugins/A/config.yml');
        expect(relativePath('./crash-reports/c.txt')).toBe('crash-reports/c.txt');
        expect(relativePath('/home/container/server.properties')).toBe('server.properties');
        expect(relativePath('plugins/A/b.yml')).toBe('plugins/A/b.yml');
    });
});

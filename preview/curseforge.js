/* eslint-disable */
// A mock of what the panel's backend answers under /api/client/curseforge, with data shaped like CurseForge's own.
const MURMUR = 0x5bd1e995;

// The same fingerprint as lib/curseforge.ts, written separately so a mistake in one shows in the other.
const fingerprint = (buffer) => {
    const bytes = Buffer.from(buffer).filter((b) => b !== 9 && b !== 10 && b !== 13 && b !== 32);
    let h = (1 ^ bytes.length) >>> 0;
    let i = 0;
    for (; bytes.length - i >= 4; i += 4) {
        let k = bytes.readUInt32LE(i);
        k = Math.imul(k, MURMUR) >>> 0;
        k = (k ^ (k >>> 24)) >>> 0;
        k = Math.imul(k, MURMUR) >>> 0;
        h = (Math.imul(h, MURMUR) ^ k) >>> 0;
    }
    const left = bytes.length - i;
    if (left >= 3) h = (h ^ (bytes[i + 2] << 16)) >>> 0;
    if (left >= 2) h = (h ^ (bytes[i + 1] << 8)) >>> 0;
    if (left >= 1) h = Math.imul((h ^ bytes[i]) >>> 0, MURMUR) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, MURMUR) >>> 0;
    return (h ^ (h >>> 15)) >>> 0;
};

const LITHIUM_JAR = Buffer.from('PK mock lithium jar\nwith some whitespace\tin it ');

const classes = [
    { id: 6, name: 'Mods', slug: 'mc-mods', isClass: true, classId: null, parentCategoryId: 432 },
    { id: 5, name: 'Bukkit Plugins', slug: 'bukkit-plugins', isClass: true, classId: null, parentCategoryId: 432 },
    { id: 17, name: 'Worlds', slug: 'worlds', isClass: true, classId: null, parentCategoryId: 432 },
    { id: 12, name: 'Resource Packs', slug: 'texture-packs', isClass: true, classId: null, parentCategoryId: 432 },
    { id: 6945, name: 'Data Packs', slug: 'data-packs', isClass: true, classId: null, parentCategoryId: 432 },
    { id: 4471, name: 'Modpacks', slug: 'modpacks', isClass: true, classId: null, parentCategoryId: 432 },
    { id: 4559, name: 'Customization', slug: 'customization', isClass: true, classId: null, parentCategoryId: 432 },
];
const cat = (id, name, slug, classId, parentCategoryId = classId, displayIndex = 0) => ({
    id, gameId: 432, name, slug, url: `https://www.curseforge.com/minecraft/${slug}`, iconUrl: `/mock-cf-img/${slug}.svg`, isClass: false, classId, parentCategoryId, displayIndex,
});
const categories = [
    ...classes,
    cat(423, 'Performance', 'performance', 6), cat(424, 'Adventure and RPG', 'adventure', 6), cat(435, 'Server Utility', 'server-utility', 6),
    cat(412, 'Technology', 'technology', 6), cat(4843, 'Automation', 'automation', 6, 412), cat(414, 'Energy', 'energy', 6, 412), cat(421, 'API and Library', 'library-api', 6),
    cat(406, 'World Gen', 'world-gen', 6), cat(409, 'Structures', 'structures', 6, 406),
    cat(1301, 'Admin Tools', 'admin-tools', 5), cat(1302, 'Chat Related', 'chat-related', 5), cat(1303, 'Economy', 'economy', 5),
    cat(253, 'Adventure', 'adventure', 17), cat(254, 'Survival', 'survival', 17), cat(255, 'Puzzle', 'puzzle', 17), cat(256, 'Parkour', 'parkour', 17),
    cat(5001, 'Vanilla Plus', 'vanilla-plus', 12), cat(5002, 'Realistic', 'realistic', 12),
    cat(6946, 'Quality of Life', 'quality-of-life', 6945),
];

const versions = ['1.21.5', '1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.2', '26.3', '26.2', '26.1', '26.3-snapshot-4', '1.21.1-Snapshot'].map((v, i) => ({
    id: 9000 + i, gameVersionId: 9000 + i, versionString: v, jarDownloadUrl: '', jsonDownloadUrl: '', approved: true, dateModified: `2026-0${(i % 9) + 1}-01T00:00:00Z`, gameVersionTypeId: 1, gameVersionStatus: 1, gameVersionTypeStatus: 1,
}));

const asset = (modId, id, title, description, slug) => ({ id, modId, title, description, thumbnailUrl: `/mock-cf-img/${slug}-t.svg`, url: `/mock-cf-img/${slug}.svg` });

let nextFile = 7000;
const file = (modId, displayName, fileName, gameVersions, patch = {}) => {
    const id = nextFile++;
    return {
        id, gameId: 432, modId, isAvailable: true, displayName, fileName, releaseType: 1, fileStatus: 4, hashes: [{ value: 'abcdef0123456789', algo: 1 }],
        fileDate: `2026-0${(id % 9) + 1}-1${id % 9}T10:00:00Z`, fileLength: 1_500_000 + id, downloadCount: 100000 - id, fileSizeOnDisk: 0,
        downloadUrl: `https://edge.forgecdn.net/files/${Math.floor(id / 1000)}/${id % 1000}/${fileName}`, gameVersions, sortableGameVersions: [], dependencies: [], fileFingerprint: 1000 + id, ...patch,
    };
};

const mods = [];
const addMod = (m, files) => {
    const full = {
        gameId: 432, status: 4, isFeatured: false, primaryCategoryId: (m.categories || [{ id: 0 }])[0].id, isAvailable: true, latestEarlyAccessFilesIndexes: [],
        dateReleased: m.dateModified, allowModDistribution: true, gamePopularityRank: 10, thumbsUpCount: Math.floor(m.downloadCount / 5000), ...m,
        links: { websiteUrl: `https://www.curseforge.com/minecraft/${m.classSlug}/${m.slug}`, wikiUrl: m.slug === 'jei' ? 'https://example.com/wiki' : null, issuesUrl: 'https://github.com/example/issues', sourceUrl: 'https://github.com/example/source' },
        authors: [{ id: m.id, name: m.author, url: `https://www.curseforge.com/members/${m.author}` }],
        logo: asset(m.id, m.id, m.name, '', m.slug),
        screenshots: m.shots ? m.shots.map((s, i) => asset(m.id, m.id * 10 + i, s[0], s[1], `${m.slug}-shot${i}`)) : [],
        latestFiles: files,
        latestFilesIndexes: files.map((f) => ({ gameVersion: f.gameVersions.find((v) => /^\d/.test(v)), fileId: f.id, filename: f.fileName, releaseType: f.releaseType, gameVersionTypeId: 1, modLoader: /Neo/.test(f.gameVersions.join()) ? 6 : /Fabric/.test(f.gameVersions.join()) ? 4 : /Forge/.test(f.gameVersions.join()) ? 1 : 0 })),
        description: m.description,
    };
    mods.push(full);
    return full;
};

const FABRIC_API = 306612;
const fabricApiFiles = [file(FABRIC_API, 'Fabric API 0.116.17', 'fabric-api-0.116.17+1.21.1.jar', ['1.21.1', 'Fabric', 'Server', 'Client'])];
addMod({ id: FABRIC_API, name: 'Fabric API', slug: 'fabric-api', classId: 6, classSlug: 'mc-mods', author: 'modmuss50', summary: 'Core API module providing common hooks and intercompatibility measures.', downloadCount: 262_000_000, categories: [cat(421, 'API and Library', 'library-api', 6)], dateCreated: '2018-11-01T00:00:00Z', dateModified: '2026-10-01T00:00:00Z', description: '<p>Essential hooks for modding with Fabric.</p>' }, fabricApiFiles);

const sodiumFiles = [
    file(394468, 'Sodium 0.6.13 (Fabric 1.21.1)', 'sodium-fabric-0.6.13+mc1.21.1.jar', ['1.21.1', 'Fabric', 'Client', 'Java 21'], { dependencies: [{ modId: FABRIC_API, relationType: 3 }, { modId: 100, relationType: 2 }], fileFingerprint: 4242 }),
    file(394468, 'Sodium 0.6.12 (Fabric 1.21.1)', 'sodium-fabric-0.6.12+mc1.21.1.jar', ['1.21.1', 'Fabric', 'Client'], { releaseType: 2, dependencies: [{ modId: FABRIC_API, relationType: 3 }] }),
    file(394468, 'Sodium 0.6.13 (Fabric 26.3)', 'sodium-fabric-0.6.13+mc26.3.jar', ['26.3', 'Fabric', 'Client', 'Java 25'], { dependencies: [{ modId: FABRIC_API, relationType: 3 }] }),
    file(394468, 'Sodium 0.5.8 (NeoForge 1.21.1)', 'sodium-neoforge-0.5.8+mc1.21.1.jar', ['1.21.1', 'NeoForge'], { releaseType: 3 }),
];
addMod({ id: 394468, name: 'Sodium', slug: 'sodium', classId: 6, classSlug: 'mc-mods', author: 'jellysquid3', summary: 'The fastest and most compatible rendering optimization mod for Minecraft.', downloadCount: 84_100_000, categories: [cat(423, 'Performance', 'performance', 6)], dateCreated: '2020-12-01T00:00:00Z', dateModified: '2026-09-30T12:00:00Z', shots: [['Frame rate', 'Before and after'], ['Settings', 'The video settings screen']],
    description: '<h2>Sodium</h2>\n    <p>A modern rendering engine and optimization mod for Minecraft.</p>\n        <ul><li>Up to <strong>3x</strong> the frame rate</li><li>Fixes graphical issues</li></ul>\n    <p><a href="https://www.curseforge.com/linkout?remoteUrl=https%3a%2f%2fexample.com">A link</a> and an image:</p><img src="/mock-cf-img/sodium-shot0.svg" alt="shot"><script>alert(1)</script>' }, sodiumFiles);

addMod({ id: 238222, name: 'Just Enough Items (JEI)', slug: 'jei', classId: 6, classSlug: 'mc-mods', author: 'mezz', summary: 'View items and recipes.', downloadCount: 276_000_000, categories: [cat(424, 'Adventure and RPG', 'adventure', 6), cat(421, 'API and Library', 'library-api', 6)], dateCreated: '2015-01-01T00:00:00Z', dateModified: '2026-09-20T00:00:00Z', description: '<p>JEI is an item and recipe viewing mod.</p>' }, [
    file(238222, 'jei-1.21.1-neoforge-19.21.0.247', 'jei-1.21.1-neoforge-19.21.0.247.jar', ['1.21.1', 'NeoForge', 'Server', 'Client']),
    file(238222, 'jei-1.21.1-fabric-19.21.0.247', 'jei-1.21.1-fabric-19.21.0.247.jar', ['1.21.1', 'Fabric', 'Server', 'Client']),
    file(238222, 'jei-1.20.1-forge-15.3.0.4', 'jei-1.20.1-forge-15.3.0.4.jar', ['1.20.1', 'Forge']),
]);

addMod({ id: 328085, name: 'Create', slug: 'create', classId: 6, classSlug: 'mc-mods', author: 'simibubi', summary: 'Aesthetic technology that empowers the player.', downloadCount: 141_000_000, categories: [cat(412, 'Technology', 'technology', 6), cat(4843, 'Automation', 'automation', 6, 412)], dateCreated: '2019-01-01T00:00:00Z', dateModified: '2026-08-02T00:00:00Z', description: '<p>Create adds machines.</p>' }, [
    file(328085, 'Create 6.0.4 for 1.21.1 (NeoForge)', 'create-1.21.1-6.0.4.jar', ['1.21.1', 'NeoForge', 'Server'], { dependencies: [{ modId: 238222, relationType: 2 }, { modId: 900, relationType: 3 }] }),
]);
addMod({ id: 900, name: 'Flywheel', slug: 'flywheel', classId: 6, classSlug: 'mc-mods', author: 'Jozufozu', summary: 'A modern engine for Minecraft.', downloadCount: 90_000_000, categories: [cat(421, 'API and Library', 'library-api', 6)], dateCreated: '2021-01-01T00:00:00Z', dateModified: '2026-07-02T00:00:00Z', description: '' }, [
    file(900, 'flywheel-neoforge-1.21.1-1.0.0', 'flywheel-neoforge-1.21.1-1.0.0.jar', ['1.21.1', 'NeoForge']),
]);

addMod({ id: 360438, name: 'Lithium', slug: 'lithium', classId: 6, classSlug: 'mc-mods', author: 'jellysquid3', summary: 'A game logic optimization mod.', downloadCount: 60_000_000, categories: [cat(423, 'Performance', 'performance', 6)], dateCreated: '2020-12-01T00:00:00Z', dateModified: '2026-09-01T00:00:00Z', description: '<p>Lithium optimizes the game server.</p>' }, [
    file(360438, 'Lithium 0.14.0 (Fabric)', 'lithium-fabric-0.14.jar', ['1.21.1', 'Fabric', 'Server', 'Client'], { fileFingerprint: fingerprint(LITHIUM_JAR) }),
]);

// An author who does not let the files be downloaded outside CurseForge: the files have no address.
addMod({ id: 65681, name: 'OptiFine', slug: 'optifine', classId: 6, classSlug: 'mc-mods', author: 'sp614x', summary: 'Optimizes graphics. Only downloadable from the author.', downloadCount: 230_000_000, categories: [cat(423, 'Performance', 'performance', 6)], dateCreated: '2012-01-01T00:00:00Z', dateModified: '2026-06-01T00:00:00Z', allowModDistribution: false, description: '<p>OptiFine is a Minecraft optimization mod.</p>' }, [
    file(65681, 'OptiFine 1.21.1 HD U J1', 'OptiFine_1.21.1_HD_U_J1.jar', ['1.21.1', 'Forge'], { downloadUrl: null }),
]);

addMod({ id: 225608, name: 'WorldEdit', slug: 'worldedit', classId: 5, classSlug: 'bukkit-plugins', author: 'sk89q', summary: 'In-game Minecraft map editor.', downloadCount: 40_000_000, categories: [cat(1301, 'Admin Tools', 'admin-tools', 5)], dateCreated: '2011-01-01T00:00:00Z', dateModified: '2026-09-05T00:00:00Z', description: '<p>WorldEdit lets you edit the world.</p>' }, [
    file(225608, 'WorldEdit 7.3.8', 'worldedit-bukkit-7.3.8.jar', ['1.21.1', '1.21', 'Paper', 'Spigot', 'Bukkit']),
]);

addMod({ id: 900001, name: 'Skyblock Adventures', slug: 'skyblock-adventures', classId: 17, classSlug: 'worlds', author: 'MapMaker', summary: 'A cooperative island survival map with quests.', downloadCount: 1_200_000, categories: [cat(253, 'Adventure', 'adventure', 17)], dateCreated: '2023-01-01T00:00:00Z', dateModified: '2026-05-05T00:00:00Z', shots: [['The island', 'Where you start']], description: '<p>A world to play.</p>' }, [
    file(900001, 'Skyblock Adventures v2.1', 'Skyblock-Adventures-v2.1.zip', ['1.21.1'], { fileLength: 18_400_000 }),
    file(900001, 'Skyblock Adventures v2.0', 'Skyblock-Adventures-v2.0.zip', ['1.20.4'], { fileLength: 17_000_000 }),
]);
addMod({ id: 900002, name: 'Parkour Paradise', slug: 'parkour-paradise', classId: 17, classSlug: 'worlds', author: 'Jumper', summary: 'Fifty levels of parkour.', downloadCount: 800_000, categories: [cat(256, 'Parkour', 'parkour', 17)], dateCreated: '2022-01-01T00:00:00Z', dateModified: '2026-04-05T00:00:00Z', description: '<p>Jump.</p>' }, [
    file(900002, 'Parkour Paradise 1.0', 'parkour-paradise.rar', ['1.21.1'], { fileLength: 9_000_000 }),
]);

addMod({ id: 900003, name: 'Vanilla Plus Textures', slug: 'vanilla-plus-textures', classId: 12, classSlug: 'texture-packs', author: 'Painter', summary: 'Slightly nicer vanilla.', downloadCount: 3_000_000, categories: [cat(5001, 'Vanilla Plus', 'vanilla-plus', 12)], dateCreated: '2021-01-01T00:00:00Z', dateModified: '2026-03-05T00:00:00Z', description: '<p>Textures.</p>' }, [
    file(900003, 'Vanilla Plus 1.6', 'VanillaPlus-1.6.zip', ['1.21.1']),
]);

const byId = (id) => mods.find((m) => m.id === id);
const strip = ({ description, classSlug, author, shots, ...rest }) => rest;
const ok = (data, pagination) => ({ data, ...(pagination ? { pagination } : {}) });

module.exports = (api, mockWrites, express) => {
    mockWrites['/mods/lithium-fabric-0.14.jar'] = LITHIUM_JAR;

    const router = express.Router();
    router.get('/', (req, res) => res.json({ enabled: process.env.PREVIEW_CURSEFORGE !== 'off' }));
    router.get('/categories', (req, res) => res.json(ok(categories)));
    router.get('/versions', (req, res) => res.json(ok(versions)));
    router.get('/search', (req, res) => {
        const q = req.query;
        let list = mods.filter((m) => !q.classId || m.classId === Number(q.classId));
        if (q.searchFilter) list = list.filter((m) => `${m.name} ${m.summary}`.toLowerCase().includes(String(q.searchFilter).toLowerCase()));
        const ids = q.categoryIds ? JSON.parse(q.categoryIds) : q.categoryId ? [Number(q.categoryId)] : [];
        if (ids.length) list = list.filter((m) => ids.some((id) => m.categories.some((c) => c.id === id || c.parentCategoryId === id)));
        if (q.gameVersion) list = list.filter((m) => m.latestFiles.some((f) => f.gameVersions.includes(q.gameVersion)));
        if (q.modLoaderType && q.gameVersion) list = list.filter((m) => m.latestFilesIndexes.some((i) => i.modLoader === Number(q.modLoaderType)));
        const sorts = { 2: (a, b) => b.downloadCount - a.downloadCount, 3: (a, b) => b.dateModified.localeCompare(a.dateModified), 6: (a, b) => b.downloadCount - a.downloadCount, 11: (a, b) => b.dateCreated.localeCompare(a.dateCreated), 12: (a, b) => b.thumbsUpCount - a.thumbsUpCount };
        list = [...list].sort(sorts[Number(q.sortField)] || sorts[2]);
        const index = Number(q.index || 0);
        const size = Number(q.pageSize || 50);
        res.json(ok(list.slice(index, index + size).map(strip), { index, pageSize: size, resultCount: Math.min(size, list.length - index), totalCount: list.length }));
    });
    router.post('/mods', (req, res) => res.json(ok((req.body.ids || []).map(byId).filter(Boolean).map(strip))));
    router.post('/files', (req, res) => res.json(ok(mods.flatMap((m) => m.latestFiles).filter((f) => (req.body.ids || []).includes(f.id)))));
    router.post('/fingerprints', (req, res) => {
        const prints = req.body.fingerprints || [];
        const exactMatches = mods.flatMap((m) => m.latestFiles.filter((f) => prints.includes(f.fileFingerprint)).map((f) => ({ id: m.id, file: f, latestFiles: m.latestFiles })));
        res.json(ok({ isCacheBuilt: true, exactMatches, exactFingerprints: exactMatches.map((m) => m.file.fileFingerprint), partialMatches: [], partialMatchFingerprints: {}, installedFingerprints: prints, unmatchedFingerprints: prints.filter((p) => !exactMatches.some((m) => m.file.fileFingerprint === p)) }));
    });
    router.get('/mods/:id', (req, res) => {
        const m = byId(Number(req.params.id));
        if (!m) return res.status(404).json({ errors: [{ code: 'CurseForgeError', status: '404', detail: 'That was not found on CurseForge.' }] });
        res.json(ok(strip(m)));
    });
    router.get('/mods/:id/description', (req, res) => res.json(ok((byId(Number(req.params.id)) || {}).description || '')));
    router.get('/mods/:id/files', (req, res) => {
        const m = byId(Number(req.params.id));
        let files = m ? m.latestFiles : [];
        if (req.query.gameVersion) files = files.filter((f) => f.gameVersions.includes(req.query.gameVersion));
        res.json(ok(files, { index: 0, pageSize: 50, resultCount: files.length, totalCount: files.length }));
    });
    router.get('/mods/:id/files/:file/changelog', (req, res) => res.json(ok(`<ul><li>Fixed a crash</li><li>Improved speed of file ${req.params.file}</li></ul>`)));
    api.use('/curseforge', router);

    // The pictures, drawn here so the preview does not depend on the CDN of CurseForge.
    const colours = ['#1d7fd1', '#2e9e5b', '#c2542d', '#8a4fc7', '#c79a1d', '#1b9aaa'];
    return (app) =>
        app.get('/mock-cf-img/:name', (req, res) => {
            const name = String(req.params.name).replace(/\.svg$/, '');
            const shot = /shot\d*(-t)?$/.test(name);
            const colour = colours[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % colours.length];
            const letter = name.replace(/-.*/, '').slice(0, 1).toUpperCase();
            res.type('image/svg+xml').send(shot
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${colour}"/><text x="320" y="200" font-size="80" text-anchor="middle" fill="white" font-family="sans-serif">${name}</text></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="14" fill="${colour}"/><text x="48" y="66" font-size="56" text-anchor="middle" fill="white" font-family="sans-serif">${letter}</text></svg>`);
        });
};

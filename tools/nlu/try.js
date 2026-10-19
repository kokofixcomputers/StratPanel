#!/usr/bin/env node
// Try phrases against the trained file:  node tools/nlu/try.js "restart lobby" "create a backup for skyblock"
const nlu = require('../../public/js/stratosphere-nlu.js');
const mk = (name) => ({ uuid: 'u-' + name, id: name.toLowerCase().replace(/\W/g, ''), name, node: 'Frankfurt', canControl: { start: true, stop: true, restart: true } });
const servers = ['Survival SMP', 'Creative Plots', 'Lobby', 'Skyblock', 'Bedwars', 'Modded Fun', 'Test Server 10', 'Test Server 2', 'Hardcore'].map(mk);
for (const phrase of process.argv.slice(2)) {
    const r = nlu.interpret(phrase, { servers, current: null });
    console.log(JSON.stringify(phrase));
    console.log('   masked:', nlu.debug.masked, '| ranked:', (nlu.debug.ranked || []).join(', '));
    console.log('   ->', r ? JSON.stringify({ intent: r.intent, servers: r.servers.map((s) => s.name), name: r.backupName, command: r.command, page: r.page && r.page.path, site: r.site && r.site.path, mode: r.mode }) : null);
}

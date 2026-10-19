/*
 * Natural language for the search box: "restart my minecraft server survival", "create a backup called weekly for lobby", "turn on dark mode".
 *
 * A small text classifier (naive Bayes on words, word pairs and letter groups, trained by tools/train-nlu.js on a few thousand generated
 * phrasings, see tools/nlu/intents.js) says what the person wants. What it is about (which server, the name of a backup, a command) is
 * found by plain rules: the names of the servers of the person, "called ...", "run ... on ...". It runs in the browser, offline, in a
 * millisecond; nothing is sent anywhere.
 *
 * This is one plain script used by the React dashboard and by the admin pages. public/js/stratosphere-nlu.js is this file with the trained model
 * put in, made by `node tools/train-nlu.js` (a test checks it is up to date). Edit this file, not that one.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.StratNlu = api;
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // The trained model; empty in the source, filled in by tools/train-nlu.js.
    var MODEL = /*__MODEL__*/ null;

    var MIN_CONFIDENCE = 0.6;

    // What the last call saw, for looking at why a phrase was understood the way it was (tools/nlu/try.js).
    var debug = {};

    /* ---- text ---------------------------------------------------------------------------------------------------------- */

    /** Lowercase, one space between words, and no punctuation that is not part of a word (a / or : stays for commands). */
    function normalize(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[‘’]/g, "'")
            .replace(/[“”]/g, '"')
            .replace(/[^a-z0-9_'"/:.\- ]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function words(text) {
        return normalize(text)
            .replace(/["':.]/g, ' ')
            .split(/[\s\-_/]+/)
            .filter(Boolean);
    }

    var FILLER = {};
    ('a an the my me our your please pls plz for to of on in at and or server servers minecraft mc world realm instance called named name it its this that now up down ' +
        'can you could would i want need like id lets let us just with from is are be do does so then also ok okay hey yo thanks thank asap real quick ' +
        'right go ahead if able your yours i\'d i\'m')
        .split(' ')
        .forEach(function (w) {
            FILLER[w] = true;
        });

    /** Edit distance (a swap of two letters counts as one) up to a limit; more than the limit just says limit + 1. */
    function distance(a, b, limit) {
        if (Math.abs(a.length - b.length) > limit) return limit + 1;
        var rows = [[], [], []];
        for (var j = 0; j <= b.length; j++) rows[1][j] = j;
        for (var i = 1; i <= a.length; i++) {
            var cur = rows[2];
            var prev = rows[1];
            var before = rows[0];
            cur[0] = i;
            var best = i;
            for (j = 1; j <= b.length; j++) {
                var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
                if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
                    cur[j] = Math.min(cur[j], before[j - 2] + 1);
                }
                if (cur[j] < best) best = cur[j];
            }
            if (best > limit) return limit + 1;
            rows = [prev, cur, before];
        }
        return rows[1][b.length];
    }

    var known = null;

    /** The words the model knows, to put right a word that is a typing mistake for one of them ("restrat" is "restart"). */
    function correct(masked, model) {
        if (!known) {
            known = {};
            model.features.forEach(function (f) {
                if (f.indexOf('w:') === 0 && f.charAt(2) !== '_') known[f.slice(2)] = true;
            });
            known = { set: known, list: Object.keys(known) };
        }
        return masked
            .split(' ')
            .map(function (token) {
                if (token.length < 4 || token.charAt(0) === '_' || known.set[token] || !/^[a-z]+$/.test(token)) return token;
                var limit = token.length >= 7 ? 2 : 1;
                var best = null;
                var bestDistance = limit + 1;
                known.list.forEach(function (word) {
                    if (word.length < 4) return;
                    var d = distance(token, word, limit);
                    if (d < bestDistance || (d === bestDistance && best !== null && word < best)) {
                        best = word;
                        bestDistance = d;
                    }
                });
                return best || token;
            })
            .join(' ');
    }

    /** How well one typed word stands for one word of a name: 1 is the same, 0 is not. Numbers have to be the same. */
    function similarity(name, typed) {
        if (name === typed) return 1;
        if (/^\d+$/.test(name) || /^\d+$/.test(typed)) return 0;
        var n = Math.min(name.length, typed.length);
        if (n >= 3 && (name.indexOf(typed) === 0 || typed.indexOf(name) === 0)) return 0.85;
        if (n >= 5 && distance(name, typed, 1) <= 1) return 0.75;
        if (n >= 7 && distance(name, typed, 2) <= 2) return 0.65;
        return 0;
    }

    /* ---- servers ------------------------------------------------------------------------------------------------------- */

    /**
     * Which of the servers the words are about. Every word of a server's name that is among the typed words counts; one that is
     * not typed does not. A single clear winner comes back alone, servers that match equally well come back together.
     */
    function matchServers(typedWords, servers) {
        var typed = typedWords.filter(function (w) {
            return w.length > 0;
        });
        var scored = [];
        servers.forEach(function (server) {
            var nameWords = words(server.name);
            // Words like "server" and "minecraft" are in half the names; they only count for a name that has nothing else.
            var plain = nameWords.filter(function (w) {
                return !FILLER[w];
            });
            var counted = plain.length ? plain : nameWords;
            var total = 0;
            var used = [];
            counted.forEach(function (nw) {
                var best = 0;
                var at = -1;
                typed.forEach(function (tw, i) {
                    if (FILLER[tw] && !(plain.length === 0 && tw === nw)) return;
                    var s = similarity(nw, tw);
                    if (s > best) {
                        best = s;
                        at = i;
                    }
                });
                if (best > 0) {
                    total += best;
                    used.push(at);
                }
            });
            if (total >= 0.7) scored.push({ server: server, score: total, used: used, size: nameWords.length });
        });
        if (!scored.length) return { servers: [], used: [] };
        scored.sort(function (a, b) {
            return b.score - a.score || a.size - b.size;
        });
        var top = scored[0];
        // Servers that fit about as well as the best one (a name that starts like another word does not count).
        var near = scored.filter(function (s) {
            return top.score - s.score < 0.1;
        });
        var used = [];
        near.forEach(function (s) {
            s.used.forEach(function (i) {
                if (used.indexOf(i) < 0) used.push(i);
            });
        });

        return { servers: near.slice(0, 3).map(function (s) { return s.server; }), used: used };
    }

    /* ---- what the person typed, in pieces ------------------------------------------------------------------------------- */

    var TAIL = '(?=\\s+(?:for|of|on|in|from|at|to)\\s|\\s*$)';
    var NAME_PATTERNS = [
        // Group 1 is the word "backup" (kept: it says what this is), then the name, which is in group 3.
        new RegExp('\\b((?:backup|snapshot|back\\s?up|copy)\\s+)(?:called|named|titled|labell?ed|name)\\s+(["\']?)(.+?)\\2' + TAIL, 'i'),
        new RegExp('\\b()(?:name|call|label|title)\\s+(?:it|this|that|the\\s+backup|the\\s+snapshot)\\s+(["\']?)(.+?)\\2' + TAIL, 'i'),
        new RegExp('\\b()with\\s+(?:the\\s+)?(?:name|label|title)\\s+(["\']?)(.+?)\\2' + TAIL, 'i'),
    ];
    var SERVER_PHRASE = /\b(?:server|world|realm|instance)\s+(?:called|named)\s+(?:"([^"]+)"|'([^']+)'|(.+?))(?=\s+(?:please|now|and|then)\b|\s*$)/i;
    var COMMAND_TRIGGER = /^(?:.*?\b)?(?:run|execute|exec|send|issue|type|enter)\s+(?:the\s+|a\s+)?(?:console\s+)?(?:command\s+)?/i;

    var NAME_GUARD = { server: 1, world: 1, realm: 1, instance: 1, minecraft: 1, mc: 1 };

    /**
     * The text of a backup name, from the typed text, with the part of the text it took out (the word "backup" stays). "called X" is a
     * backup's name only when it does not follow "server" (that is the name of the server), and only in a request for a backup.
     */
    function findBackupName(text) {
        for (var i = 0; i < NAME_PATTERNS.length; i++) {
            var m = NAME_PATTERNS[i].exec(text);
            if (m) {
                var name = m[3].trim().replace(/^["']|["']$/g, '').trim();
                if (name) return { name: name.slice(0, 80), span: [m.index + m[1].length, m.index + m[0].length] };
            }
        }
        if (!/\b(?:back\s?up|backup|snapshot|copy|archive)\b/i.test(text)) return null;
        var re = /\b(called|named|titled)\s+(["']?)(.+?)\2(?=\s+(?:for|of|on|in|from|at|to)\s|\s*$)/gi;
        var hit;
        while ((hit = re.exec(text))) {
            var before = text.slice(0, hit.index).trim().split(/\s+/).pop().toLowerCase();
            var label = hit[3].trim();
            if (NAME_GUARD[before] || !label) {
                // Not a backup's name: carry on looking just after this word, the text it covers may hold one.
                re.lastIndex = hit.index + hit[1].length;
                continue;
            }
            return { name: label.slice(0, 80), span: [hit.index, hit.index + hit[0].length] };
        }
        return null;
    }

    function trimCommand(text) {
        return text.replace(/^["'`]+|["'`.!?]+$/g, '').replace(/^\/+/, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * "run say hi on lobby", "send command /save-all to survival", "execute time set day in creative": the command and the text that
     * is left (which names the server). The split is where the part after "on", "in", "to" or "for" names a server.
     */
    function findCommand(text, servers, current) {
        var quoted = /(?:"([^"]+)"|`([^`]+)`)/.exec(text);
        var trigger = COMMAND_TRIGGER.exec(text);
        var slash = /(^|\s)\/([a-z][\w:-]*(?:\s+[^\s].*?)?)(?=\s+(?:on|in|to|for|at)\s|\s*$)/i.exec(text);
        var start = -1;
        if (trigger && trigger[0].length < text.length) {
            start = trigger[0].length;
        } else if (slash) {
            start = slash.index + slash[1].length;
        } else {
            var tell = /^(?:tell|ask|make|have)\s+(.+?)\s+(?:to\s+)?(run|say|execute|do)\s+(.+)$/i.exec(text);
            if (tell) {
                return { command: trimCommand((tell[2].toLowerCase() === 'say' ? 'say ' : '') + tell[3]), before: 'tell', after: tell[1] };
            }
            return null;
        }
        var rest = text.slice(start);
        if (quoted && quoted.index >= start - 1) {
            var q = trimCommand(quoted[1] || quoted[2]);
            if (q) return { command: q, before: text.slice(0, quoted.index), after: text.slice(quoted.index + quoted[0].length) };
        }
        var splits = [];
        var re = /\s+(on|in|to|for|at|of)\s+/gi;
        var m;
        while ((m = re.exec(rest))) splits.push(m.index);
        for (var i = splits.length - 1; i >= 0; i--) {
            var head = rest.slice(0, splits[i]);
            var tail = rest.slice(splits[i]).replace(/^\s+(on|in|to|for|at|of)\s+/i, '');
            var names = matchServers(words(tail), servers);
            var here = /^(?:the\s+|this\s+|my\s+)?(?:current\s+)?(?:server|console|minecraft(?:\s+server)?|here)$/.test(tail.trim());
            // "... in the console of lobby": the console is not part of the command.
            head = head.replace(/\s+(?:in|on|into|to|at)\s+(?:the\s+)?(?:server\s+)?(?:console|terminal)$/i, '');
            if ((names.servers.length || here) && trimCommand(head)) {
                return { command: trimCommand(head), before: text.slice(0, start), after: rest.slice(splits[i]) };
            }
        }
        var plain = trimCommand(rest);
        // "run lobby" starts a server, it does not send "lobby" to a console.
        if (plain && matchServers(words(plain), servers).servers.length && words(plain).length <= 3) return null;
        return plain ? { command: plain, before: text.slice(0, start), after: '' } : null;
    }

    /* ---- the classifier -------------------------------------------------------------------------------------------------- */

    /** The features of a phrase: its words, pairs of words and groups of letters (so a typo is still mostly recognised). */
    function features(text) {
        var tokens = normalize(text).replace(/["':.]/g, ' ').split(/[\s\-/]+/).filter(Boolean);
        var out = [];
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            out.push('w:' + t);
            if (i > 0) out.push('b:' + tokens[i - 1] + ' ' + t);
            if (t.charAt(0) !== '_' && t.length >= 4) {
                var padded = '<' + t + '>';
                for (var k = 0; k + 3 <= padded.length; k++) out.push('c:' + padded.substr(k, 3));
            }
        }
        return out;
    }

    /** The probability of each intent for a phrase that has had its names masked. */
    function classify(masked, model) {
        model = model || MODEL;
        if (!model) return [];
        var index = model._index;
        if (!index) {
            index = {};
            model.features.forEach(function (f, i) {
                index[f] = i;
            });
            model._index = index;
        }
        var scores = model.prior.slice();
        var seen = {};
        features(masked).forEach(function (f) {
            var at = index[f];
            if (at === undefined || seen[f]) return;
            seen[f] = true;
            for (var c = 0; c < scores.length; c++) scores[c] += model.weights[at][c] / 100;
        });
        var max = Math.max.apply(null, scores);
        var sum = 0;
        var exp = scores.map(function (s) {
            var e = Math.exp(s - max);
            sum += e;
            return e;
        });
        return exp
            .map(function (e, i) {
                return { intent: model.classes[i], p: e / sum };
            })
            .sort(function (a, b) {
                return b.p - a.p;
            });
    }

    /* ---- pages, account, theme ------------------------------------------------------------------------------------------- */

    // The pages of a server (path under /server/<id>) and what people call them, longest names are looked for first.
    var PAGES = [
        ['/', 'Console', ['console', 'logs', 'log', 'terminal', 'output', 'server console']],
        ['/players', 'Players', ['players', 'player list', 'who is online', 'whitelist', 'operators', 'bans', 'banned players', 'online players']],
        ['/versions', 'Versions', ['versions', 'version', 'minecraft version', 'software', 'server software', 'change version', 'update minecraft']],
        ['/properties', 'Properties', ['properties', 'server properties', 'motd', 'difficulty', 'game mode', 'gamemode', 'game rules', 'gamerules']],
        ['/mods', 'Content', ['content', 'mods', 'plugins', 'datapacks', 'data packs', 'modrinth', 'curseforge', 'mod list', 'plugin list', 'resource packs']],
        ['/worlds', 'Worlds', ['worlds', 'maps', 'seed', 'map']],
        ['/tools', 'Tools', ['tools', 'generators', 'generator']],
        ['/files', 'Files', ['files', 'file manager', 'file browser', 'file editor', 'editor', 'folders', 'file', 'config files']],
        ['/import', 'Importer', ['importer', 'import', 'migrate']],
        ['/databases', 'Databases', ['databases', 'database', 'mysql', 'mariadb']],
        ['/schedules', 'Schedules', ['schedules', 'schedule', 'scheduled tasks', 'cron', 'timers', 'automation', 'tasks']],
        ['/users', 'Users', ['users', 'subusers', 'sub users', 'access', 'who can access', 'share', 'invite', 'collaborators']],
        ['/backups', 'Backups', ['backups', 'backup list', 'backup page', 'backup tab', 'snapshots', 'restore', 'restore backup', 'saved backups']],
        ['/network', 'Network', ['network', 'ports', 'port', 'allocations', 'ip address', 'ips']],
        ['/domains', 'Domains', ['domains', 'domain', 'subdomain', 'custom domain', 'dns']],
        ['/trash', 'Trash', ['trash', 'recycle bin', 'deleted files', 'bin']],
        ['/startup', 'Startup', ['startup', 'environment variables', 'variables', 'java version', 'startup command', 'launch options', 'jvm flags']],
        ['/settings', 'Settings', ['settings', 'sftp', 'rename', 'reinstall', 'server settings', 'debug information']],
        ['/activity', 'Activity', ['activity', 'activity log', 'audit log', 'audit', 'history']],
    ];

    var SITE = [
        ['/', 'Dashboard', ['dashboard', 'home', 'home page', 'all my servers', 'server list', 'my servers', 'main page', 'front page']],
        ['/account', 'Account settings', ['account', 'account settings', 'profile', 'my account', 'change my password', 'password', 'email', 'two factor', '2fa', 'authenticator']],
        ['/account/api', 'API credentials', ['api', 'api keys', 'api key', 'api credentials', 'token', 'access token', 'api token']],
        ['/account/ssh', 'SSH keys', ['ssh', 'ssh keys', 'ssh key', 'public key', 'sftp key']],
        ['/account/providers', 'Sign-in providers', ['providers', 'linked accounts', 'github', 'discord', 'google login']],
        ['/account/passkeys', 'Passkeys', ['passkeys', 'passkey', 'security key', 'webauthn']],
        ['/account/activity', 'Account activity', ['account activity', 'login history', 'logins', 'sign in history']],
    ];

    function findIn(table, text) {
        var padded = ' ' + normalize(text).replace(/["':.]/g, ' ').replace(/[\-_/]+/g, ' ').replace(/\s+/g, ' ') + ' ';
        var best = null;
        table.forEach(function (row) {
            row[2].forEach(function (name) {
                if (padded.indexOf(' ' + name + ' ') >= 0 && (!best || name.length > best.len)) best = { row: row, len: name.length };
            });
        });
        return best ? { path: best.row[0], name: best.row[1] } : null;
    }

    function findMode(text) {
        var t = normalize(text);
        // Complaints ask for the other one: "too bright", "i hate the bright screen", "lights off".
        var complaint = /\b(too|hate|hurts?|blind|blinding|annoying|much|eyes)\b/.test(t);
        if (/\b(bright|light)\b/.test(t) && complaint) return 'dark';
        if (/\b(dark|dim)\b/.test(t) && complaint) return 'light';
        if (/\blights? off\b/.test(t)) return 'dark';
        if (/\blights? on\b/.test(t)) return 'light';
        var dark = /\b(dark|night|black|dim)\b/.test(t);
        var light = /\b(light|bright|white|day)\b/.test(t);

        return dark && !light ? 'dark' : light && !dark ? 'light' : 'toggle';
    }

    /* ---- putting it together ----------------------------------------------------------------------------------------------- */

    var POWER = { start: 'start', stop: 'stop', restart: 'restart', kill: 'kill' };
    var NEEDS_SERVER = { start: 1, stop: 1, restart: 1, kill: 1, backup: 1, command: 1, page: 1, open: 1 };

    function pick(list, n) {
        return list.slice(0, n);
    }

    /**
     * What the person means, or null when this is not a request (a name, a question, nothing). `context` is
     * { servers: [{ uuid, id, name, ... }], current: server or null (the one that is open) }.
     */
    function interpret(query, context) {
        context = context || {};
        var servers = context.servers || [];
        var current = context.current || null;
        var raw = String(query || '').trim();
        if (raw.length < 3 || !MODEL) return null;
        var text = normalize(raw);

        // 1. The name of a backup, and a command: taken out, so their words are not mistaken for anything else.
        var backup = findBackupName(raw);
        var withoutName = backup
            ? (raw.slice(0, backup.span[0]) + ' ' + raw.slice(backup.span[1])).replace(/\s+(and|with|then|using|plus)\s*$/i, '').trim()
            : raw;
        var command = findCommand(withoutName, servers, current);
        var body = command ? (command.before + ' _cmd_ ' + command.after).trim() : withoutName;

        // 2. Which server: "server called X" says it, otherwise the words that look like the name of one.
        var phrase = SERVER_PHRASE.exec(body);
        var typed = words(phrase ? phrase[1] || phrase[2] || phrase[3] : body);
        var found = matchServers(typed, servers);
        var masked = body;
        if (found.servers.length) {
            var tokens = normalize(body).replace(/["':.]/g, ' ').split(/\s+/).filter(Boolean);
            var typedAll = tokens.map(function (t) {
                return t.replace(/[\-/]+/g, ' ');
            });
            var replaced = [];
            var inRun = false;
            tokens.forEach(function (tok, i) {
                var hit = found.servers.some(function (s) {
                    var nameWords = words(s.name);
                    var plain = nameWords.filter(function (w) {
                        return !FILLER[w];
                    });
                    return (plain.length ? plain : nameWords).some(function (nw) {
                        return (!FILLER[tok] || (plain.length === 0 && tok === nw)) && similarity(nw, tok) > 0;
                    });
                });
                if (hit) {
                    if (!inRun) replaced.push('_srv_');
                    inRun = true;
                } else {
                    replaced.push(typedAll[i]);
                    inRun = false;
                }
            });
            masked = replaced.join(' ');
        } else {
            masked = normalize(body);
        }
        if (backup) masked += ' _name_';

        // 3. What it is.
        masked = correct(masked, MODEL);
        var ranked = classify(masked);
        debug.masked = masked;
        debug.ranked = ranked.slice(0, 3).map(function (r) {
            return r.intent + ' ' + r.p.toFixed(2);
        });
        var top = ranked[0];
        if (!top || top.intent === 'none' || top.p < MIN_CONFIDENCE) return null;

        var result = { intent: top.intent, confidence: top.p, servers: [], usedCurrent: false, query: raw };
        if (NEEDS_SERVER[top.intent]) {
            var chosen = found.servers;
            if (!chosen.length && top.intent !== 'open') {
                if (current) {
                    chosen = [current];
                    result.usedCurrent = true;
                } else if (servers.length === 1) {
                    chosen = [servers[0]];
                }
            }
            if (!chosen.length) return null;
            result.servers = pick(chosen, 3);
        }
        if (top.intent === 'backup') result.backupName = backup ? backup.name : '';
        if (top.intent === 'command') {
            if (!command || !command.command) return null;
            result.command = command.command.slice(0, 200);
        }
        if (top.intent === 'page') {
            var page = findIn(PAGES, text);
            if (!page) return null;
            result.page = page;
        }
        if (top.intent === 'site') {
            var site = findIn(SITE, text);
            if (!site) return null;
            result.site = site;
        }
        if (top.intent === 'theme') result.mode = findMode(text);
        if (POWER[top.intent]) result.signal = POWER[top.intent];

        return result;
    }

    return {
        interpret: interpret,
        classify: classify,
        features: features,
        normalize: normalize,
        matchServers: matchServers,
        words: words,
        similarity: similarity,
        PAGES: PAGES,
        SITE: SITE,
        MIN_CONFIDENCE: MIN_CONFIDENCE,
        debug: debug,
        get model() {
            return MODEL;
        },
    };
});

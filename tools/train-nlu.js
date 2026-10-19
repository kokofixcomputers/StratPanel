#!/usr/bin/env node
/**
 * Trains the classifier of the search box and writes public/js/stratosphere-nlu.js (tools/nlu/engine.js with the model put in).
 *
 *   node tools/train-nlu.js
 *
 * The phrases it learns from are made from the grammars of tools/nlu/intents.js, with the same random choices every time, so the
 * same input always gives the same file (a test checks that the file in the repository is up to date).
 */
const fs = require('node:fs');
const path = require('node:path');
const engine = require('./nlu/engine.js');
const data = require('./nlu/intents.js');

const ENGINE_SOURCE = path.join(__dirname, 'nlu/engine.js');
const OUTPUT = path.join(__dirname, '../public/js/stratosphere-nlu.js');

// A small random number generator that gives the same numbers every time.
const random = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SAMPLES = { start: 520, stop: 520, restart: 520, kill: 460, backup: 700, open: 480, page: 1500, command: 520, site: 560, theme: 0, none: 0 };

function generate(rand) {
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const polite = (text) => `${pick(data.POLITE_BEFORE)}${text}${pick(data.POLITE_AFTER)}`.replace(/\s+/g, ' ').trim();
    const typo = (text) =>
        text
            .split(' ')
            .map((word) => {
                if (word.length < 4 || word.startsWith('_') || rand() > 0.35) return word;
                const i = 1 + Math.floor(rand() * (word.length - 2));
                switch (Math.floor(rand() * 4)) {
                    case 0:
                        return word.slice(0, i) + word.slice(i + 1);
                    case 1:
                        return word.slice(0, i) + word[i] + word.slice(i);
                    case 2:
                        return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
                    default:
                        return word.slice(0, i) + 'qwertyuiopasdfghjklzxcvbnm'[Math.floor(rand() * 26)] + word.slice(i + 1);
                }
            })
            .join(' ');
    const finish = (text) => (rand() < 0.2 ? typo(polite(text)) : polite(text));
    const target = (named = 0.78) => (rand() < named ? pick(data.TARGETS) : pick(data.NO_TARGETS));

    const rows = [];
    const add = (intent, text) => rows.push([intent, text.replace(/\s+/g, ' ').trim()]);

    // Verbs that take a server.
    for (const intent of ['start', 'stop', 'restart', 'kill', 'backup', 'open']) {
        for (let i = 0; i < SAMPLES[intent]; i++) {
            // The plainest ways to say it, with nothing around them, are the ones typed most.
            if (rand() < 0.18) {
                add(intent, `${pick(data.VERBS[intent].filter((v) => !v.includes('{t}')).slice(0, 6))} ${pick(['_srv_', '_srv_', 'the _srv_', 'my _srv_'])}`);
                continue;
            }
            const verb = pick(data.VERBS[intent]);
            const t = target(intent === 'open' ? 0.92 : 0.78);
            let text = verb.includes('{t}') ? verb.replace('{t}', t || 'it') : `${verb} ${t}`;
            // A backup may be given a name; the engine takes it out of the phrase and puts _name_ at the end.
            if (intent === 'backup' && rand() < 0.35) text += ' _name_';
            add(intent, finish(text));
        }
    }
    for (let i = 0; i < SAMPLES.page; i++) {
        // A good share are questions ("what are the players for lobby"): the ones that sound least like a request.
        const phrase = rand() < 0.45 ? pick(data.PAGE_QUESTIONS) : pick(data.PAGE_PHRASES);
        const t = phrase.includes('{t}') ? target(0.75) : '';
        add('page', finish(phrase.replace('{t}', t).replace('{p}', pick(data.PAGE_WORDS))));
    }
    for (let i = 0; i < SAMPLES.command; i++) {
        const phrase = pick(data.COMMAND_PHRASES);
        add('command', finish(phrase.replace('{t}', target(0.8) || 'the server')));
    }
    for (let i = 0; i < SAMPLES.site; i++) {
        add('site', finish(pick(data.SITE_PHRASES).replace('{s}', pick(data.SITE_WORDS))));
    }
    for (const phrase of data.THEME_PHRASES) {
        for (let k = 0; k < 6; k++) add('theme', finish(phrase));
    }
    for (const phrase of data.NONE_PHRASES) {
        for (let k = 0; k < 3; k++) add('none', k === 0 ? phrase : finish(phrase));
    }
    for (let i = 0; i < 320; i++) {
        add('none', finish(pick(data.NONE_TEMPLATES).replace('{t}', target(0.7) || 'my server').replace('{p}', pick(data.PAGE_WORDS))));
    }
    // Phrases that are only a name, or a name with a few ordinary words.
    const ordinary = ['the', 'a', 'my', 'is', 'are', 'what', 'how', 'why', 'when', 'good', 'great', 'bad', 'new', 'old', 'big', 'small', 'game', 'play', 'time', 'day', 'night', 'fun', 'cool', 'server', 'minecraft', 'about', 'with', 'and', 'or', 'but', 'today', 'tomorrow'];
    for (let i = 0; i < 260; i++) {
        const n = 1 + Math.floor(rand() * 5);
        const parts = Array.from({ length: n }, () => (rand() < 0.3 ? '_srv_' : pick(ordinary)));
        add('none', parts.join(' '));
    }

    return rows;
}

/**
 * Multinomial logistic regression on the features (the classifier is a linear one: a score per intent from the weights of the features that
 * are in the phrase, then the highest wins). Unlike counting words per intent, it also learns which words rule an intent out ("stop" alone is
 * not "force stop").
 */
function train(rows, rand) {
    const classes = Array.from(new Set(rows.map((r) => r[0]))).sort();
    const classIndex = Object.fromEntries(classes.map((c, i) => [c, i]));
    const featured = rows.map(([intent, text]) => [classIndex[intent], Array.from(new Set(engine.features(text)))]);

    // Which features to keep: those that tell the classes apart most (mutual information), seen at least 3 times.
    const counts = new Map();
    const docs = classes.map(() => 0);
    for (const [c, fs_] of featured) {
        docs[c]++;
        for (const f of fs_) {
            if (!counts.has(f)) counts.set(f, classes.map(() => 0));
            counts.get(f)[c]++;
        }
    }
    const total = featured.length;
    const scored = [];
    for (const [f, perClass] of counts) {
        const present = perClass.reduce((a, b) => a + b, 0);
        if (present < 3) continue;
        let mi = 0;
        perClass.forEach((n, c) => {
            if (n > 0) mi += (n / total) * Math.log(n / present / (docs[c] / total));
        });
        scored.push([f, mi]);
    }
    scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const kept = scored.slice(0, 1800).map(([f]) => f);
    const index = new Map(kept.map((f, i) => [f, i]));
    const data = featured.map(([c, fs_]) => [c, fs_.map((f) => index.get(f)).filter((i) => i !== undefined)]);

    const C = classes.length;
    const W = kept.map(() => new Float64Array(C));
    const bias = new Float64Array(C);
    const order = data.map((_, i) => i);
    const EPOCHS = 40;
    const L2 = 1e-5;
    for (let epoch = 0; epoch < EPOCHS; epoch++) {
        // The same shuffle every time.
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        const lr = 0.3 * (1 - epoch / (EPOCHS + 5));
        for (const at of order) {
            const [label, fs_] = data[at];
            const z = Array.from(bias);
            for (const f of fs_) for (let c = 0; c < C; c++) z[c] += W[f][c];
            const max = Math.max(...z);
            let sum = 0;
            const p = z.map((v) => {
                const e = Math.exp(v - max);
                sum += e;
                return e;
            });
            for (let c = 0; c < C; c++) {
                const grad = p[c] / sum - (c === label ? 1 : 0);
                bias[c] -= lr * grad;
                for (const f of fs_) W[f][c] -= lr * (grad + L2 * W[f][c]);
            }
        }
    }

    return {
        classes,
        features: kept,
        weights: W.map((w) => Array.from(w, (v) => Math.round(v * 100))),
        prior: Array.from(bias, (v) => Math.round(v * 100) / 100),
    };
}

function build() {
    const rows = generate(random(20261019));
    const model = train(rows, random(77));
    const source = fs.readFileSync(ENGINE_SOURCE, 'utf8');
    const marker = '/*__MODEL__*/ null';
    if (!source.includes(marker)) throw new Error('engine.js has lost its model marker');
    const header = '/* Made by tools/train-nlu.js from tools/nlu/engine.js and tools/nlu/intents.js. Do not edit, change those and run `node tools/train-nlu.js`. */\n';
    const output = header + source.replace(marker, JSON.stringify(model));

    // The model on its own to look at what it learned from, as the engine will read it.
    return { output, model, rows };
}

module.exports = { build, generate, train, random };

if (require.main === module) {
    const { output, model, rows } = build();
    fs.writeFileSync(OUTPUT, output);
    const counts = {};
    rows.forEach(([intent]) => (counts[intent] = (counts[intent] || 0) + 1));
    console.log(`${rows.length} phrases, ${model.features.length} features, ${model.classes.length} intents -> ${path.relative(process.cwd(), OUTPUT)} (${Math.round(output.length / 1024)} KB)`);
    console.log(counts);
}

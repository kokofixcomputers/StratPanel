#!/usr/bin/env node
/**
 * Writes resources/scripts/assets/css/theme.css from resources/scripts/assets/css/palette.js: the CSS variables of the light and the
 * dark theme. Run it after changing a colour:   node tools/build-theme.js
 */
const fs = require('node:fs');
const path = require('node:path');
const { scales, singles } = require('../resources/scripts/assets/css/palette');

const triplet = (value) => {
    const n = parseInt(value.replace('#', ''), 16);

    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const block = (selector, mode, scheme) => {
    const lines = [];
    for (const [name, scale] of Object.entries(scales)) {
        for (const [shade, value] of Object.entries(scale[mode]))
            lines.push(`    --c-${name}-${shade}: ${triplet(value)};`);
    }
    for (const [name, single] of Object.entries(singles)) lines.push(`    --c-${name}: ${triplet(single[mode])};`);
    lines.push(`    color-scheme: ${scheme};`);

    return `${selector} {\n${lines.join('\n')}\n}`;
};

const css = `/* Written by tools/build-theme.js from palette.js, do not edit by hand. */

${block(':root', 'light', 'light')}

${block('.dark', 'dark', 'dark')}

/* A part of the page that is always light, such as the pictures of the game's own screens. */
${block('.theme-light', 'light', 'light')}
`;

fs.writeFileSync(path.join(__dirname, '../resources/scripts/assets/css/theme.css'), css);
console.log('theme.css written');

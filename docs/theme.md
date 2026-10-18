# Dark mode

The panel has a light and a dark theme. The theme button in the top bar cycles through **device** (follow the operating system),
**light** and **dark**; the choice is kept in the browser (`localStorage`, key `stratosphere:theme`). The page sets the class before
it is drawn (`resources/views/partials/theme.blade.php`), so there is no flash of the wrong theme.

## How it works

- `resources/scripts/assets/css/palette.js` holds every colour twice, once for the light and once for the dark theme.
- `node tools/build-theme.js` writes `assets/css/theme.css` from it: CSS variables (`--c-neutral-500`, `--c-primary-600`, ...) as
  `R G B` triplets under `:root` (light), `.dark` on `<html>` (dark) and `.theme-light` (forces light inside a dark page).
  Run it after changing the palette.
- `tailwind.config.js` maps the Tailwind colours to those variables, so `bg-neutral-700`, `text-primary-600` and opacity
  modifiers (`bg-black/50`) follow the theme without a `dark:` prefix.
- `white` is the colour of a card, `black` the colour of text on a page; use `snow` for white that must stay white (text on a
  coloured button).
- `lib/theme.ts` is the logic (`useTheme()`, `setThemeChoice()`, the `stratosphere:themechange` event).

## Things that are not CSS

| What | How it follows the theme |
| --- | --- |
| Console (xterm) | `terminal.setOption('theme', ...)` in `Console.tsx` |
| File editor (Monaco) | `panel` and `panel-dark` themes, `monaco.editor.setTheme()` on the theme event |
| Charts, ring gauges, sparklines | CSS variables in the SVG/canvas styles |
| Sign in icons | GitHub uses the text colour; the other marks keep their brand colours |
| Embedded tools (Tools tab, Superflat) | `lib/toolsTheme.ts` sends the dark or light colours (and `mode`) in the `state` message |
| Logo and favicon | Uploaded pictures, shown as they are |

The Blade admin area (`/admin`) is AdminLTE and has no dark theme yet.

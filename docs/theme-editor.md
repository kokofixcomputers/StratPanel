# Theme editor

Admins who may change the branding get **Settings > Theme editor** (a link in the settings tabs). It opens `/theme-editor`, a page of the
React panel (`components/admin/ThemeEditor.tsx`), not of the Blade admin: controls on the left, a live preview (light or dark) on the right.
Nothing changes for anybody until *Save theme*; *Discard* goes back to what is saved and *Reset to default* deletes the theme.

What can be set (`lib/themeConfig.ts`): presets (the old coloured gradients are gone; the backgrounds are quiet ones with a version for light and one for dark), accent colour, a secondary colour that tints surfaces and borders, the default mode for
visitors who never chose one, corners (sharp / soft / round / pill), buttons and fields (follow the corners / pills / square), shadows, font,
the dashboard servers as a list or side by side (2 or 3 at most, one column on a phone), spacing, a background (gradient, uploaded picture or
https address, blur and dim) and see-through cards with blur behind them.

How it works:
* The editor turns the settings into a few blocks of CSS custom properties (`buildThemeCss`) and sends them with the settings. The server keeps
  both (`Services/Theme/ThemeService.php`, settings keys `settings::theme:config` and `settings::theme:css`).
* The CSS is printed in the head of every React page (`resources/views/partials/theme.blade.php`). The server refuses anything but
  `--variables` on `html:root` and `html.dark`, and checks it again when printing, so a theme cannot carry script or other CSS.
* The styles of the panel read those variables: the colour scales (`assets/css/theme.css`), radius, shadow and font in `tailwind.config.js`,
  buttons and inputs, and the background, glass cards and server grid in `assets/css/GlobalStylesheet.ts`.
* The layout and default mode are read from `window.SiteConfiguration.theme` (`useThemeConfig`).
* Uploaded pictures go to `public/branding/` like the favicon. Uploading and saving use `/api/client/theme` (permission
  `settings.branding.update`).
* New settings need three places: `ThemeConfig` and `buildThemeCss`, the validation in `Api/Client/ThemeController.php`, and a control in
  the editor. `lib/themeConfig.spec.ts` and `tests/Integration/Theme/ThemeTest.php` share the sample `tests/Fixtures/theme.css`
  (regenerate it from `buildThemeCss(presetConfig('glass'))` when the output changes on purpose).

More settings (second round):
* **Colours:** accent, secondary tint, success / danger / warning (replace the green, red and yellow+amber scales), and per mode (light, dark) the
  page, card, border, text and muted colours (`surface`, the neutral scale is derived from them in `surfaceVars`).
* **Shape:** exact corner radius in px (`radiusCustom`), text size in percent (`fontScale`, scales the root font size).
* **Bars and menus:** top bars attached or floating (`data-chrome` on `<html>`, the class `app-nav`/`app-subnav`), the current page in menus as tint,
  solid or line (`data-nav`, the classes `nav-item is-active`, `nav-right`), surface material frosted / subtle / custom / off (becomes `--card-alpha`
  and `--card-blur`). The attributes are set by the inline script of `partials/theme.blade.php` before the page is drawn.
* **Dashboard rows:** which metrics (players, cpu, memory, disk, uptime, network), in what order, and whether the address and description show.
* **Server sidebar:** hide items, reorder them inside their group, add links of your own to a group (`{id}` and `{uuid}` in the address stand for
  the server), see `lib/sidebarLayout.ts`.
* **Console:** follows the theme or is always dark, text brightness (colours move toward the background) and font size (`lib/consoleTheme.ts`).
  The default brightness is 85%, a little dimmer than before.
* The editor page removes the saved theme from itself while it is open, so the preview shows the draft alone.

Third round:
* **Editor layout:** a slim rail of icons on the left (the sections), it opens on hover to show the name and description of each section; one
  section at a time is shown next to it (`SECTIONS` in `ThemeEditor.tsx`). The preview draws the real `ServerRow` (`preview` prop, made up data,
  `ThemeConfigContext` gives it the draft config) so sizes match the panel.
* **Floating bars** stay put while scrolling (`position: sticky` on `.app-nav`).
* **Server row size** small / medium (the new default) / large, and the state mark as bar / dot / hidden (`data-row-size`, `data-row-status`).
* **Buttons:** style solid / soft / outline / gradient, hover lift / glow / grow / shine, press squish / sink (classes `btn`, `btn-primary`, `btn-flat`).
* **Motion:** card and row hover, speed (off / fast / normal / slow), page change (fade / slide up / none), pulse for running servers. Devices that
  ask for less motion never get animations.
* **More:** lines around cards (subtle / none / strong), page width, sidebar width and a sidebar without its own card, heading weight, letter spacing.
* The marks on `<html>` (`data-*`) are made by `themeAttributes(config)`, sent with the CSS, stored (`settings::theme:attributes`) and printed by
  `partials/theme.blade.php`; `ThemeService` lets only the names in `ATTRIBUTE_NAMES` and short lowercase values through.

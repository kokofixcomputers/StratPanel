# Theme editor

Admins who may change the branding get **Settings > Theme editor** (a link in the settings tabs). It opens `/theme-editor`, a page of the
React panel (`components/admin/ThemeEditor.tsx`), not of the Blade admin: controls on the left, a live preview (light or dark) on the right.
Nothing changes for anybody until *Save theme*; *Discard* goes back to what is saved and *Reset to default* deletes the theme.

What can be set (`lib/themeConfig.ts`): presets, accent colour, a secondary colour that tints surfaces and borders, the default mode for
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

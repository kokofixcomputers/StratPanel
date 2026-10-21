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
* The editor page removes the saved theme from itself while it is open, so it stays readable whatever the theme is.

Third round:
* **Editor layout:** a slim rail of icons on the left (the sections), it opens on hover to show the name and description of each section; one
  section at a time is shown next to it (`SECTIONS` in `ThemeEditor.tsx`). The preview is the real panel in a frame (see below).
* **Floating bars** stay put while scrolling (`position: sticky` on `.app-nav`).
* **Server row size** small / medium (the new default) / large, and the state mark as bar / dot / hidden (`data-row-size`, `data-row-status`).
* **Buttons:** style solid / soft / outline / gradient, hover lift / glow / grow / shine, press squish / sink (classes `btn`, `btn-primary`, `btn-flat`).
* **Motion:** card and row hover, speed (off / fast / normal / slow), page change (fade / slide up / none), pulse for running servers. Devices that
  ask for less motion never get animations.
* **More:** lines around cards (subtle / none / strong), page width, sidebar width and a sidebar without its own card, heading weight, letter spacing.
* The marks on `<html>` (`data-*`) are made by `themeAttributes(config)`, sent with the CSS, stored (`settings::theme:attributes`) and printed by
  `partials/theme.blade.php`; `ThemeService` lets only the names in `ATTRIBUTE_NAMES` and short lowercase values through.

The preview is the real panel (fourth round): `LivePreview.tsx` shows `/?theme-preview=1` (or `/server/<id>?...`, `/account?...`) in an iframe drawn at
1280px (or 390px for a phone) and scaled to fit. The editor sends the draft with `postMessage` on every change; inside such a frame `lib/themePreview.ts`
(started from `index.tsx`) replaces the theme style and the `data-*` marks, switches light or dark, and updates `useThemeConfig`, nothing is saved.
The message is only taken from the parent page of the same origin. A message was used instead of a long `?preview=<data>` address so the preview
updates live and the address stays short; the frame can be browsed like the real panel. `SetSecurityHeaders` allows framing (`SAMEORIGIN`) only for
requests that have `theme-preview` in the query, everything else keeps `DENY`.

Login page (fifth round): `login` in the config (`lib/themeConfig.ts`), edited in the section "Login page" (the preview switches to the login page).
* **Layout** (`components/auth/LoginFormContainer.tsx`, used by every sign in, registration and password screen): *card* (the form in a card in the
  middle), *brand shell* (one side with the logo, title, tagline and highlights over the background, the form as a card on the other side), *split*
  (the same, the form side is a plain panel without a card), *showcase* (the background fills the page, the form floats on one side, the title sits
  at the bottom). The side of the form can be left or right. On phones only the form is shown.
* **Background** (`components/auth/AuthBackground.tsx`): none, a quiet gradient (light and dark version), your own image (blur and dim), *scanning
  light* (grid with a band of light and a line sweeping across), *squares* (generated, always the same ones, some fade in and out), *egg banners*
  (rows of the server software banners sliding past each other). Variables: `--login-gradient`, `--login-image`, `--login-blur`, `--login-dim`.
* The editor previews it with the real login screen at `/theme-preview/login` (the real `/auth/login` sends signed in people away); it is inert.
* Public pages get the settings through `SiteConfiguration.theme` and the printed CSS like all other pages.

Gradients of your own: pick "Your own" next to the ready made gradients, in the Background section and in the Login page section (both use the
same one, `customGradient` in the config). It has an angle, 2 or 3 colours, and a separate set of colours for the light and for the dark theme;
`customGradientCss` writes it, `components/admin/theme/GradientPicker.tsx` edits it.

Folders and status dots: `folders.style` in the config (Dashboard section) is *sections* (each folder a part of the list that folds, the way it was), *chips*
(folders as chips under the filters, with a dot and a count, a click shows only that folder, "All servers" and "Not in a folder" next to them) or
*cards* (folders drawn like servers, a click opens the folder with a way back; loose servers follow below). While a search or filter is on, chips and
cards look through every folder. Servers can be dragged onto a chip or a card. The dot of a folder is green when something in it runs, amber when
something is starting or cannot be reached, red when all are off (`folderSummary` in `lib/dashboardList.ts`), and the Online / Offline / Other
filter chips have their own green / red / amber dots (`components/dashboard/FolderViews.tsx`).

The image background of the page needed two fixes: the editor sent the upload as JSON (the client sets that by default, so the server never got the
picture), and choosing "Image" before a picture existed switched straight back to "None" so the upload never showed.

Sidebars (three of them, `sidebars` in the config, `lib/sidebarLayout.ts`): *inside a server*, *outside of servers* (on the dashboard and the create page, new, off
until an admin turns it on) and *account*. Each has categories (like "Manage" in the admin area) with items in them: categories can be added, renamed,
moved and removed, items moved inside a category or to another one, built in items hidden, and links of your own put in a category (`{id}` and
`{uuid}` in a link stand for the server in the server sidebar). An empty layout is the default one; the first change makes the default categories
explicit. Items the layout does not place (a new page of an extension) are shown under "More". The width and the card of the sidebars are shared.
Settings saved before there were three sidebars (`sidebar` with an order, hidden items and links per group) are carried over to the server sidebar.
`resolveSidebar` decides what a sidebar shows, `components/admin/theme/SidebarEditor.tsx` edits one.

Server banners (`banners` in the config, section "Server banners"): a picture for each egg (listed by `GET /api/client/theme/eggs`, a server tells its egg
as `egg_id`) and for each software, also those that are no egg (Vanilla, Paper, Purpur, Spigot, Fabric, Quilt, Forge, NeoForge, Velocity). The picture
fills the whole row of a server in place of the faint software logo, covered by the card colour (`dim`) so the text can be read. A server gets the
banner of its egg first, else the one of its software (`bannerFor`).

Numbers on a server row (`row.metricStyle`, Dashboard section, drawn by `Metric` in `components/dashboard/ServerRow.tsx`): *bars* (label and value with a bar and
"of the limit", the way it was), *tiles* (each number in a small card, side by side), *rings* (a circular gauge with the value next to it) and *chips*
(small pills with a dot that is green, amber from 70% and red from 90% load, which take the least room). Numbers that have no limit (uptime, network)
show without a bar or ring.

Branding and announcements in the editor (own sections in the rail, `components/admin/theme/BrandingPanels.tsx`): the logo and favicon (one picture), the custom links in the
bars, and the announcements of the dashboard. They are branding, not theme, so they are saved by their own buttons (`/api/client/theme/branding`, the same
`BrandingService` as Admin > Settings > Branding, same limits) and the preview frame is loaded again after a save because the panel prints them at load.
The rail of sections scrolls when the window is not tall enough for all of them.

Power dock (`powerDock`, section Buttons): the power buttons (start, stop, restart, and kill after a stop) floating at the bottom of every server page, as a dock of
icons or a dock with labels (`components/server/PowerDock.tsx`, it reuses `PowerButtons` so the permissions and the kill confirmation are the same). The page gets
room at the bottom (`body.has-power-dock`). Off by default, the buttons in the header and the sidebar stay either way.

Live announcements and links: the Announcements and Branding panels send what is being typed to the preview frame as it changes (`branding` in the draft message, applied by
`lib/themePreview.ts` over the saved branding in the frame's store), so a note shows in the real dashboard before it is saved; the buttons still save.

Search and sharing (`seo` in `BrandingService`, section "Search and sharing", saved with `PUT /api/client/theme/branding`): page title, meta description, share image
(Open Graph and Twitter card tags, `resources/views/partials/seo.blade.php`), whether search engines may list the sign in page (`robots`: noindex by default), the colour
of the browser bar (`theme-color`, kept as it is instead of following light and dark when set) and the name and short name of the installed app. The web app manifest is
public at `/manifest.webmanifest` (`Base/ManifestController.php`, name, short name, colours, the logo as the icon); the page links it and sets the Apple app title.
An empty field means the name of the panel.

Console prompt (`console_prompt` in `BrandingService`, default `container@stratosphere~`): the text in front of the lines the panel writes itself in a server console ("Server marked as
offline...", the transfer failure notice, the lines of a forced stop). It is set under Admin > Settings > Branding (Console prompt box) or in the theme editor's Branding section, only
letters, numbers and `@ . _ ~ : -` and spaces (max 40), empty is the default. It reaches the page with the rest of the branding, `Console.tsx` reads it with `useBranding`. Lines that come
from Wings or the game are not changed.

Your own presets (section Presets, `components/admin/theme/MyPresets.tsx`): *Save as preset* keeps the look being edited under a name; the tile applies it to the draft again, the refresh
button replaces it with the current look, and there are rename and delete. They are kept on the server (`settings::theme:presets`, up to 30, shared by the admins, not touched by
*Reset to default*) and only change what the panel shows once one is applied and the theme is saved, so styles can be tried freely and the one you like stays safe.
`GET/POST /api/client/theme/presets`, `PUT/DELETE /api/client/theme/presets/{id}`; a preset is checked with the same rules as a theme (`ThemeController::validateConfig`).

Background in dark mode: the root element has a colour of its own in dark mode (set by `partials/theme.blade.php` before the page is drawn, so it does not flash white) and the body has the page colour, and a
body with a colour is painted over the picture that sits behind the page. When there is a picture or gradient, `<html data-bg-image="true">` (made by `ThemeService::attributes()` from the CSS, so
themes saved earlier get it too) puts the page colour on the root and makes the body transparent (`GlobalStylesheet.ts`). The preview server prints the same dark root colour so this shows there.

Link cards on the dashboard (`link_cards` in `BrandingService`, section "Link cards", `components/dashboard/LinkCards.tsx`, icons in `lib/linkIcons.tsx`): as many cards as wanted (up to 8, 12 links each), like
"NEED A HAND?" with Discord and Support. Each card goes on top of the servers (above the search) or at the bottom, and is drawn as a *list* (links in one box), as *cards* (a tall card per link with its
address) or as a *grid* (the same, but low tiles that take little height). A link has an icon from a set of about 45 (Discord, GitHub, GitLab, Google, Microsoft marks and plain ones such as support, docs,
store, status), a name and an address (a path of the panel or http(s), checked like the custom links), and opens in a new tab or not. Cards that are off or have no link are not sent to the page. They are
branding like the announcements: saved by their own button, shown live in the preview as typed.

Size of the link cards: the links of a card in the *cards* and *grid* styles share the whole width, side by side (`.link-grid`, `--c-sm` and `--c-lg` are how many go in a row on a tablet and on a
wide screen), and the more there are the smaller each gets: 1 or 2 links are big cards (large icon, large name, address), 3 or 4 are medium, 5 or more small. More links than fit one row are spread
over equal rows (`columnsFor` in `lib/linkCards.ts`: 6 links are 3 and 3). One column on a phone.

Announcements as a page (`components/admin/theme/AnnouncementsPage.tsx`): the section has the whole editor page, with no preview next to it. Every announcement is a card in the order it is shown (drag a card by its
handle, or use the arrows that appear on hover), switched on and off with a switch on the card; opening a card shows all of it (title, message, kind, link, shown, dismissible, where, who it is for) with a back
button, and one *Save announcements* button saves the list. **Where**: the dashboard, inside servers, account settings (`where`, the dashboard when none; `Announcements place=...` in `DashboardContainer`,
`ServerRouter`, `DashboardRouter`). **Who it is for**: `eggs`, `software` and `nodes`, any one of a list and all of the lists (`appliesTo` in `lib/branding.ts`): a person needs a server of one of the eggs, one
running one of the software (found out from the files of a server and remembered by the panel, so it counts once a server was looked at: `readCachedSoftware`) and one on one of the nodes. Nothing is shown
while the list of servers is still loading. This is done in the browser, so it keeps a note short, it is not a secret. The cards of links have `where` too. The old branding page of the admin area keeps these settings
as they are when it saves.

The sliders and checkboxes of the editor are the theme's own: `Slider` is a track that fills with the accent colour (`input.theme-range`, `--fill`) and `Switch` is an on and off switch (`controls.tsx`).

# Search box, player counts and player actions

**The search box** is in the top bar of every page except sign in and sign up (and, with the same list, in the admin pages). Open it by clicking, with
`Ctrl`/`Cmd` + `K`, or with `/` when not typing. It finds:

* **Servers** by name, description, address or node. Admins also find servers of other users and get the admin page of each one.
* **Actions of the server that is open**: start, restart, stop, kill, "Back up now" and all its pages (Files, Players, Backups, ...), as far as the
  person's permissions go.
* **Power by name from anywhere**: `restart survival`, `stop lobby`, `start creative` offer the servers that match.
* **Admin pages and actions** (Updates, Update the panel, Restore a panel backup, Create a server, Settings pages, ...), only the ones the person may open.
  The list is made on the panel (`App\\Services\\Palette\\AdminDestinations`, `GET /api/client/palette`) with the same permissions as the routes.
* Account pages, and switching the theme.

The dashboard version is React (`components/palette`, `lib/palette.ts`); the admin pages are not part of the React app, so they use a plain script
(`public/js/admin-palette.js`). A test (`adminPalette.spec.ts`) keeps their matching identical.

**Player counts** on the server list come from the servers themselves: the panel sends each running server the "server list ping" every Minecraft
client sends (`App\\Services\\Minecraft\\ServerListPing`, `GET /api/client/dashboard/players`). Nothing needs to be installed on the server, but **the
panel has to be able to reach the game port** (the address of the default allocation, or the node when that is 0.0.0.0). A server that does not answer
simply shows no number. Answers are kept for 15 seconds; at most 100 servers per request.

**Whisper, kick and ban** are buttons in the player window. They send `msg`, `kick` and `ban` on the console of the server (so the server has to be
running and the person needs the console permission). A reason or message is made one line, and a name that could carry a second command is refused.

## Saying what you want

Besides searching, the box understands sentences. It shows what it understood at the top ("Suggested"), and Enter does it. Some examples:

| You type | It offers |
| --- | --- |
| `start survival`, `start my minecraft server survival`, `boot up lobby please`, `turn on bedwars` | Start the server |
| `stop creative`, `shut down the lobby`, `power off skyblock now`, `take lobby offline` | Stop |
| `restart lobby`, `reboot survival`, `give hardcore a restart`, `power cycle creative` | Restart |
| `kill the frozen modded fun`, `force stop lobby`, `terminate bedwars` | Kill |
| `create a backup for my minecraft server called Survival SMP`, `create backup lobby`, `back up bedwars`, `snapshot modded fun` | Back it up |
| `create a backup called weekly for skyblock`, `back up bedwars and name it before update`, `make a backup called "Pre Update 1.21" of survival` | Back it up with that name |
| `run say hello on lobby`, `send command /time set day to creative plots`, `tell lobby to say server restarting in 5 minutes` | Send a console command |
| `open the files of survival`, `show me the console for lobby`, `go to skyblock players`, `take me to the backups of bedwars` | Open that page of that server |
| `open survival`, `jump to the lobby server`, `take me to skyblock` | Open the server |
| `go to account settings`, `change my password`, `open my api keys`, `take me to the dashboard` | Open that page |
| `dark mode`, `switch to light mode`, `it is too bright`, `toggle theme` | Change the theme |

Typing mistakes are put right (`restrat lobby`, `shut dwon skyblock`, `reboot survivel`). With a server open, leaving its name out means that one
(`create a backup`, `run list`, `open the files`); with only one server, it means that one. When several servers fit equally well (`restart test server`),
each is offered. Anything that is not a request (`lobby`, `how do i restart a server`, `hello`) is searched for as before. What it offers is always visible
before anything is done, and the permissions of the person are respected (a server they may not stop is not offered a stop).

### How it works

A small trained text classifier (a logistic regression on words, word pairs and groups of letters, about 100 KB) says what is meant; plain rules find what it is about:
the names of the person's own servers (matched loosely: `surv`, `survivel`, numbers must be exact), `called ...` for the name of a backup, `run ... on ...` for a command. It
runs in the browser, offline, in a millisecond, and nothing is sent anywhere. There is no AI service involved.

* `tools/nlu/engine.js` is the engine, `tools/nlu/intents.js` the grammars the training phrases are made from (a few thousand, with polite beginnings and endings, other
  words for the same thing and typing mistakes), `tools/train-nlu.js` trains it and writes `public/js/stratosphere-nlu.js` (`npm run nlu:train`). The file is used by the dashboard
  and by the admin pages alike, and a test fails when it is not what the training makes.
* To teach it a new way of saying something, add the words to `intents.js`, retrain, and add the sentence to `resources/scripts/lib/nlu.spec.ts`.
* `node tools/nlu/try.js "restart lobby"` shows what it makes of a sentence: the phrase as the classifier saw it, the top intents and what it found.

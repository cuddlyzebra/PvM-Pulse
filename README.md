# PvM Pulse

A modern, cross-platform rebuild of the ability-tracking overlay concept from
[LeMageTank's RS3 Ability Tracker](https://github.com/LeMageTank/LMT-RS3-Ability-Tracker),
built as a separate project focused on a much simpler setup flow and a real
live overlay for OBS/Twitch.

## What this tool does (and doesn't do)

This app only listens for keyboard/mouse events at the OS level (via
`uiohook-napi`, the same category of library any hotkey utility, macro-remap
tool, or streaming software with global hotkeys uses) and displays what you
pressed in its own separate overlay window. Specifically, it:

- **Does not** read the RuneScape client's memory
- **Does not** read pixels from the game window
- **Does not** inject synthetic keypresses, clicks, or any other input
- **Does not** communicate with Jagex's servers in any way
- **Is not aware the game exists** - it only observes physical key/mouse
  events you generate yourself, for display purposes

It's a passive input logger paired with a local overlay renderer, not a bot
or macro (which would read game state and inject input to act on your
behalf). That said, this is a standalone tool, not built on Jagex's [Alt1
Toolkit](https://runeapps.org/alt1) (the sanctioned overlay/plugin system
RotationMaster itself uses) - so unlike an Alt1 app, it doesn't inherit
Alt1's explicit sanctioning. Whether a given third-party tool is acceptable
under Jagex's Rules of RuneScape and third-party software policy is a
question for Jagex, not something this README can answer on their behalf -
if you're unsure, check their current policy or ask them directly before
relying on this for anything beyond personal use.

## What changed vs. the original

- **Setup**: instead of dragging boxes over a screenshot of your screen and
  typing raw keycodes, you search for an ability and click "Press key…" —
  the app captures the real keypress. No screen calibration.
- **Overlay**: instead of repeatedly saving a PNG to disk that OBS polls for
  changes, a local WebSocket server pushes each ability cast to the overlay
  the instant it happens. Animations are handled in the overlay page itself.
- **Platform**: Electron + React/TypeScript instead of Python/tkinter, so it
  runs on Windows and macOS (Linux via AppImage too), and the UI uses normal
  web layout instead of hand-placed pixel coordinates.
- **Ability data & icons**: sourced from [RotationMaster](https://github.com/cuddlyzebra/RotationMaster)
  rather than the original tracker's data. See "Ability data & icons" below
  for why.
- **No cooldown/GCD simulation**: the app shows every keybind-triggered
  ability immediately, rather than trying to model RuneScape's global
  cooldown/queueing (see that section for why).

## Ability, weapon & perk data + icons

`data/abilityinfo.json` (897 items) and `data/icons/` (2,261 icon files)
are both built from [RotationMaster](https://github.com/cuddlyzebra/RotationMaster)'s
bundled icon library (`src/assets/abilities.json` + `src/assets/resource/abilities/`),
via `scripts/build-ability-data.py`. Despite the filename, this now covers
more than abilities - every entry (ability, weapon, or perk) is treated the
same way by the app: a name, a category tag, an icon, bindable to any key.
Breakdown:

| Tag | Count | What |
|---|---|---|
| `melee` / `ranged` / `magic` / `necromancy` / `defence` / `unlockable` | 338 | Combat abilities |
| `melee-gear` / `ranged-gear` / `magic-gear` / `necromancy-gear` | 489 | Weapons & armour (undyed base items - see "Dyed weapons" below for adding dyed variants) |
| `perk` | 70 | Invention perks |

This replaced an earlier approach that ported LeMageTank's original ability
list directly. That list predates RuneScape's **March 2026 "Combat Style
Modernisation" rework**, which restructured the entire ability system —
many old abilities (Slice, Cleave, Sever, and others) no longer exist, and
new ones (Rend, Adaptive Strike, Bloodlust mechanics) were added.
RotationMaster's data is actively maintained (its most recent commit is from
September 2026) and already reflects the current roster, so it's a more
reliable source than either the old ported list or hand-transcribing wiki
pages — pulling name + icon from the same source also means no separate
matching step, and coverage on the 338 combat abilities is 100%.

### Dyed weapons

Dyeing a weapon in RuneScape creates a genuinely different item, not a
cosmetic skin on the same item ID - so full coverage needs a distinct icon
per weapon per dye colour.

Correction to an earlier version of this section: it claimed RotationMaster
had dyed variants hidden under garbled auto-generated names (e.g.
`shadowkhopeshoh`). That wasn't accurate - checking RotationMaster's raw
data directly shows it doesn't track dyed weapons at all, under any name.
`scripts/build-ability-data.py` still has a `GARBLED_NAME` filter for gear
entries as a defensive measure (in case a future RotationMaster update adds
something like that), but as of the current data it filters out nothing.

Dyed weapons instead come from a **separate, opt-in pass** that pulls real
icons directly from the RS3 wiki, since the wiki does have a distinct image
per dyed variant (confirmed via
[Drygore longsword (shadow)](https://runescape.wiki/w/Drygore_longsword_(shadow))).
This has to run from a machine that can actually reach runescape.wiki - it's
not pre-bundled - so it's a script you run yourself:

```bash
node scripts/fetch-dyed-icons.js
```

That's the only step. It downloads icons into `data/icons/dyed/` and writes
`data/dyed-abilityinfo.json`, a file kept **deliberately separate** from
`data/abilityinfo.json` (the base set this app's own updates overwrite
wholesale). `electron/abilityData.js` merges the two together live, every
time the app starts - so dyed items just show up, and stay showing up even
after a future update to the rest of the app, without any manual re-merge
step to remember. `npm run dev` picks it up on next launch; a packaged
build picks it up too, since `data/**/*` is what electron-builder bundles.

The script is also incremental and safe to re-run any time (e.g. after
adding entries to `scripts/dye-weapons-manifest.json`) - it only requests
what it doesn't already have, and never discards a previous run's results,
even if a later run gets interrupted or the wiki temporarily rate-limits it
(it detects that and stops cleanly rather than misrecording items as "not
found").

`scripts/dye-weapons-manifest.json` lists the ~32 tier-90+ dyeable weapons
(scythes, godswords, drygore weapons, khopeshes, bows, crossbows, staves,
wands, and the two necromancy weapons), plus 25 dyeable armour pieces
(Malevolent; Sirenic/Elite sirenic; Elite Dracolich; Tectonic/Elite
tectonic; First Necromancer's equipment - crown, robe top, robe bottom,
hand wrap, foot wraps - piece names confirmed from
[Category:Dyeable equipment](https://runescape.wiki/w/Category:Dyeable_equipment)
and [Robe top of the First Necromancer (Shadow)](https://runescape.wiki/w/Robe_top_of_the_First_Necromancer_(Shadow))),
and the known dye colours (shadow, soul, blood, ice, barrows, aurora, third
age). The fetch script tries each item/colour combination against the wiki
and keeps whichever ones actually exist there - not every item supports
every colour, and it skips anything it can't find rather than guessing.

**Not included**: the Malevolent, Vengeful, and Merciless kiteshields, and
chaotic-tier weapons (crossbow, maul, rapier) - confirmed to have no dyed
variants at all, so there's nothing to fetch for them.

**Licensing note, same caveat as the RotationMaster data below**: these
icons come from runescape.wiki (Weird Gloop), not this project - they're
downloaded into `data/icons/dyed/` by a script you run, not redistributed
by this repo's own commits unless you choose to commit them. Worth a quick
check of the wiki's own reuse terms before that goes beyond personal/local
use, same as the note on RotationMaster's assets.

Two other icon sources were considered and set aside:

- **PVME's icon catalog** (via [pvme/pvme-settings](https://github.com/pvme/pvme-settings)):
  large and actively maintained, but the images are hosted on Discord's CDN
  and Imgur rather than bundled in the repo — using it would mean fetching
  from external hosts at runtime, a dependency that can break independently
  of this app. Worth revisiting as a supplementary source if RotationMaster
  ever falls behind on a future rework.
- **The original tracker's icon set** (289 hand-added PNGs, no lookup
  table, pre-rework) — superseded entirely by the above.

To rebuild after RotationMaster's data changes (e.g. after a future combat
rework):

```bash
python3 scripts/build-ability-data.py /path/to/RotationMaster/src/assets/abilities.json
```

**Licensing note**: this project itself is MIT-licensed (see `LICENSE`) —
free for anyone to use, modify, or redistribute. That covers the code
written here, but it doesn't retroactively grant rights to material pulled
in from elsewhere:

- The RotationMaster data (`data/icons/`, `data/abilityinfo.json`) comes
  from a repo with no `LICENSE` file, forked from
  [Ellamental2/RotationMaster](https://github.com/Ellamental2/RotationMaster),
  which also has none. Without an explicit license, default copyright
  applies to that material regardless of what license this repo uses.
- Ultimately traces back to RuneScape 3 game assets (Jagex's IP), which sit
  outside any of these repos' licenses entirely.

I'm not a lawyer, so treat this as a heads-up rather than legal advice —
worth a quick check with the relevant maintainers (or Jagex's asset-use
policy) before this goes beyond personal/local use, since "our code is MIT"
and "everything in the repo is free to redistribute" aren't the same claim.

## No cooldown/GCD simulation

The original tracker modeled RuneScape's global cooldown and per-ability
cooldowns, queueing an ability's display until its cooldown cleared. This
rebuild doesn't: it shows every keybind press immediately. RotationMaster's
data doesn't include cooldown values, but more importantly, client-side key
detection can't actually know the true in-game cooldown state anyway — a
failed cast, a stun, or a misclick would all make a simulated cooldown
wrong regardless of how accurate the underlying numbers are. Showing what
was actually pressed doesn't claim an accuracy the app can't back up.

## Project layout

```
electron/            Main process (Node) — runs outside the browser sandbox
  main.js             App entry point, wires everything together
  preload.js          Safe bridge exposing window.tracker to the UI
  inputListener.js     Global keyboard hook (uiohook-napi) -> resolves keybinds -> ability casts
  overlayServer.js     Local HTTP+WebSocket server for the OBS overlay page
  profileStore.js      Loads/saves the user's keybind profile (cross-platform paths)
  abilityData.js        Loads + merges data/abilityinfo.json with data/dyed-abilityinfo.json

overlay/              What OBS's Browser Source actually loads
  index.html / overlay.js / overlay.css   Live, animated, transparent-background overlay

src/                  The setup UI (React, runs in the Electron window)
  App.tsx              Main screen: search abilities, bind keys, see overlay URL + live preview
  components/          KeybindRow, StyleBarPanel, KeyCaptureButton, OverlayLinkPanel, LivePreview

data/                 Ability data + icons, built from RotationMaster (see above)
scripts/              build-ability-data.py - regenerates data/abilityinfo.json + data/icons/
```

## Running it (Windows)

1. Install [Node.js](https://nodejs.org) (LTS).
2. Extract the project and open a terminal in the folder that directly
   contains `package.json`.
3. `npm install`. If npm warns that `electron`, `uiohook-napi`, or `esbuild`
   have install scripts pending approval (a newer npm safety feature),
   approve them — they're legitimate (Electron's browser binary, the native
   keyboard-hook binary, and esbuild's native bundler binary, respectively):
   ```
   npm install-scripts approve electron
   npm install-scripts approve esbuild
   npm install-scripts approve uiohook-napi
   npm install
   ```
4. `npm run dev` — starts the setup window.

Windows Defender/antivirus may flag the app on first run because it
installs a global keyboard hook — that's inherent to how any keybind
tracker works, not malware.

## Building a distributable .exe (so other people don't need Node/npm)

The `npm install` + `npm run dev` steps above are only for *you*, building
the app. To hand it to other content creators who should never see npm or
Node at all:

```
npm run package
```

This bundles Node, Electron, and everything the app needs into standalone
Windows binaries under `/release`. It'll take longer than `npm install`
the first time, since `electron-builder` downloads its own packaging tools
(NSIS, etc.) — that needs internet access but no further input from you.
You'll get two files:

- `PvM Pulse Setup <version>.exe` — a normal installer (Start Menu
  shortcut, uninstaller, install location picker)
- `PvM Pulse <version>.exe` — a **portable** single file: no install step
  at all, just download and double-click to run

For "download the zip, open the program," the portable one is the closer
fit — zip it up (or send it directly) and that's the whole distribution.

One thing to flag since I can't test a real build in the environment I'm
working in: `uiohook-napi` is a native module (compiled code, not
JavaScript), and Electron can't run native modules from inside its default
packed archive format — `package.json`'s build config already excludes it
from that archive (`asarUnpack`), which should be the fix, but this is
exactly the kind of thing that's only fully proven by an actual build. If
`npm run package` fails, or the packaged .exe runs but keybinds silently
stop working, paste the error and we'll sort it — same as the `npm install`
round we already went through.

Recipients will still likely see a Windows SmartScreen warning on first run
(unsigned .exe — code-signing costs money and isn't set up here), same as
the antivirus note above. "More info → Run anyway" gets past it.

## Adding this overlay to OBS

1. Run the app — it starts a local server on `http://127.0.0.1:5859`.
2. In the setup window, copy the overlay URL shown under "3. Overlay".
3. In OBS: **Add Source → Browser Source**, paste the URL. Background is
   transparent by default, no file path to browse to.

## Style bars

If you switch combat styles mid-fight (melee/ranged, melee/magic, etc.)
and reuse the same physical keys for different abilities per style - "D"
being Wild Magic on a magic bar but Greater Flurry on a melee bar, say -
**style bars** solve that: each bar has its own keybinds, and only one is
"active" (read by the key listener) at a time.

Three ways to switch which bar is active, and they all stay in sync with
each other:

1. **Weapon-trigger keys** (the main one): give a bar the same key you
   already press in-game to swap to that weapon/style, and pressing it
   switches the app's active bar too - automatically, silently (it doesn't
   itself show up on the overlay, it just changes what subsequent ability
   keys resolve to).
2. **Clicking the bar's tab** in the setup window - a manual override, e.g.
   for picking a starting bar before your first weapon swap of a session.
3. **A cycle key** (optional, set once bars.length > 1) - advances to the
   next bar, wrapping around.

**Shared keybinds** cover the keys that *don't* change between styles -
defensives, movement, prayer flicks. Rather than a separate fixed section,
"shared" is a checkbox on each individual keybind (shown once you have at
least one style bar): checked means that key resolves the same no matter
which bar is active; unchecked ties it to whichever bar you're currently
viewing. If the same physical key is bound both as shared and specifically
in the active bar, the bar-specific one wins - lets one style override a
shared default for just that key.

If you don't use multiple styles, none of this needs any attention -
with no style bars added, keybinds behave exactly like a single flat list,
same as before this existed.

## What's not built yet (next steps)

Community-requested features, roughly in build order:

- **Custom icon overrides** — pick your own image for any ability, weapon,
  or perk, overriding the bundled icon (or filling a gap where there isn't
  one, like the dyed-weapon gaps above).
- **Update notifications** — check a GitHub repo's releases on startup and
  notify if a newer version is available.
- **Mouse-click (action bar slot) bindings**: this app focuses on keyboard
  bindings, which cover the setup pain point directly reported (typing raw
  keycodes). Mouse-click zones would need a lighter-weight version of the
  original's screen-region picker — worth designing carefully so it
  doesn't reintroduce the same friction.
- **APM counter / extension system**: the original's second "extension".
  Not ported yet; the new plugin model (in-process modules vs. separate OS
  processes) still needs to be designed.
- **Perk "modifier" display**: perks are bindable/searchable now (see
  above) but shown as plain entries, not composited as a small badge on a
  weapon's icon the way in-game gizmo perks visually attach to gear.

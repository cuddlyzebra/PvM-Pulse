# PvM Pulse

**A modern ability-tracker overlay for RuneScape 3 content creators.**
Bind your in-game keys once, and PvM Pulse shows exactly what you're
casting, live, as a transparent overlay in OBS or any streaming software.

PvM Pulse started as a from-scratch rebuild of the idea behind
[LeMageTank's RS3 Ability Tracker](https://github.com/LeMageTank/LMT-RS3-Ability-Tracker) -
same goal (show viewers your rotation), but built as its own project with a
much simpler setup flow, a real push-based overlay instead of file polling,
and an ability/weapon/perk dataset that's actually kept up to date.

**[⬇ Download the latest release](../../releases/latest)**

---

## Features

- **No calibration.** Search for an ability, click "Press key…", press the
  key. No screenshot wizards, no typing raw keycodes.
- **Live overlay, not a polled image.** A local WebSocket server pushes
  every cast to the overlay the instant you press the key - no flicker, no
  lag waiting for OBS to notice a changed file.
- **986+ bindable items**: every current combat ability across all styles,
  plus weapons, armour, jewellery, book-slot items, and Invention perks -
  sourced from
  [RotationMaster](https://github.com/cuddlyzebra/RotationMaster), which is
  actively maintained and reflects the post-"Combat Style Modernisation"
  (March 2026) roster.
- **Dyed weapons & armour**, bundled in and searchable out of the box -
  see [Dyed weapons & armour](#dyed-weapons--armour) below for how that
  data gets extended over time.
- **Style bars**: bind different abilities to the same key per combat
  style (melee/ranged/magic), and switch between them automatically when
  you swap weapons in-game, manually, or with a cycle key. See
  [Style bars](#style-bars) below.
- **Search & filter**: tag chips (melee, ranged, magic, necromancy,
  perk, gear...), text search across both name and tag, and a separate
  filter for your already-bound keys once your list gets long.
- **Icon previews everywhere** - in the search list and next to each bound
  key - so you can visually confirm a match before you commit to it.
- **Undo/redo.** `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`), plus Undo/Redo
  buttons in the header, cover keybind edits, style bar changes, and
  settings - handy for an accidental misclick like ticking a keybind's
  "shared" checkbox, which instantly moves it to a different tab.
- **Cross-platform**: Windows, macOS, and Linux (via Electron); packaged
  Windows builds need no Node/npm at all for end users.
- **Honest about what it does.** See
  [What this tool does (and doesn't do)](#what-this-tool-does-and-doesnt-do).

---

## Installing (no coding required)

1. Grab **`PvM Pulse <version>.exe`** from the
   [latest release](../../releases/latest) - it's portable, so there's no
   install step, just download and double-click.
   (An earlier beta also shipped an installer build alongside the portable
   one, but it had a packaging bug where the combat-ability list didn't
   load correctly, while the portable build was unaffected - so for now
   only the portable build is published. It may come back once that's
   tracked down.)
2. Windows will likely show a SmartScreen warning on first run (the .exe
   isn't code-signed - that costs money and isn't set up for this project).
   Click **More info → Run anyway**.
3. Your antivirus may also flag it on first run, because it installs a
   global keyboard hook to detect your keypresses. That's inherent to how
   any keybind tracker works (the same category of thing as a macro tool
   or hotkey utility), not something to be alarmed by - see
   [What this tool does (and doesn't do)](#what-this-tool-does-and-doesnt-do)
   for exactly what it does and doesn't touch.
4. Open the app. That's it - no accounts, no config files to hand-edit.
5. Closing the window asks whether to **minimize to the system tray**
   (keeps tracking keybinds and serving the OBS overlay in the background -
   the normal choice while streaming) or **quit completely** (stops both;
   the overlay goes blank until you reopen the app). A tray icon appears
   either way - right-click it for Show/Quit, or just left-click to bring
   the window back. Only one copy of PvM Pulse runs at a time; opening it
   again while it's already running (e.g. double-clicking the .exe a second
   time) shows a prompt asking whether to bring the existing window forward,
   instead of silently starting - or silently refusing to start - a second
   copy.

## Quick start

1. **Find an ability.** Type into the search box, or click a tag chip
   (e.g. `melee`) to narrow the list. Weapons, armour, and perks are
   searchable the same way as abilities.
2. **Bind a key.** Click the "+" next to an ability to add it to your
   keybind list, then click "Press key…" and press the actual key you use
   in-game for it (any key works now, including symbols like `/`, `;`, `-`,
   `[`, `]`). Pick a modifier (shift/ctrl/alt) from the dropdown if your
   bind uses one. Reorder your list with the ▲/▼ buttons for a one-step
   nudge, or drag a row by the handle (⠿) on its left for a longer move -
   purely for your own organization, it doesn't change how anything's
   matched. Changed your mind about which ability a row should be? Click its icon,
   search for the replacement, and click it - the keybind stays put, only
   the ability changes. A newly added row scrolls into view automatically
   so you don't have to go hunting for it.
3. **That's live immediately** - no save button to remember. The app
   auto-saves shortly after every change, quietly, with no "Saving…"
   indicator to distract you. There's still a manual "Save Profile" button
   next to the profile switcher if you want to trigger one yourself.
4. **Add the overlay to OBS**: copy the URL shown under "3. Overlay" in
   the app, then in OBS: **Add Source → Browser Source**, paste it in.
   Background is transparent by default.
5. Press your bound keys in-game (or just at your desk to test) - the
   ability should appear in the live preview inside the app, and on the
   OBS overlay.

**Multiple saved profiles.** The **Profile:** dropdown (below the header)
holds several named profiles you can switch between without leaving the
app - one per character, one per boss loadout, whatever suits you.
**+ New** starts a blank one, **Duplicate** copies the current one under a
new name (handy for "same as my main setup but tweak a few keys"),
**Rename** and **Delete** do what they say (there's always at least one
profile left - the last one can't be deleted). Switching is immediate and
live, same as everything else here.

**Moving to another PC, or just backing up your setup:** use **Export
Profile…** (top right) to save the *current* profile to a single file, and
**Import Profile…** on the other machine (or after a reinstall) to load it
back in - into whichever profile is active there when you import. To bring
someone else's export in as a new profile instead of overwriting your
current one, create a new profile first, then import into that.

## Style bars

If you play multiple combat styles in the same fight (melee/ranged,
melee/magic, etc.) and reuse the same physical keys for different
abilities per style - "D" being Wild Magic on a magic bar but Greater
Flurry on a melee bar, say - **style bars** solve that. Each bar has its
own keybinds, and only one is "active" (read by the tracker) at a time.

**Setup:**

1. Click **"+ Add style bar"** once per style you use (e.g. "Melee",
   "Ranged", "Magic").
2. Optionally, give each bar a **weapon-trigger key** - the same key you
   already press in-game to equip that weapon/style. Click the small key
   button next to the bar's name and press it.
3. Select a bar's tab, then add abilities as usual - they're bound to
   whichever bar's tab is currently open.
4. For keys that should work **no matter which style is active**
   (defensives, movement, prayer flicks), tick the **"shared"** checkbox
   next to that keybind - it immediately moves to its own **"Shared
   abilities"** tab (shown bold, alongside your style bars), separate from
   each bar's own keybind list. If that was a misclick, `Ctrl+Z` undoes it.

**Switching which bar is active**, three ways (all kept in sync):

- **Automatically** - press a bar's weapon-trigger key (in-game, to swap
  gear) and the tracker switches to that bar too. By default nothing shows
  up on the overlay for the switch itself - it just changes what your next
  ability key resolves to - but see **Showing the weapon on swap** below if
  you want it to.
- **Manually** - click a bar's tab in the app, useful for picking a
  starting bar before your first weapon swap of a session.
- **A cycle key** (optional, once you have more than one bar) - advances
  to the next bar, wrapping around.

If a key is bound both as "shared" and specifically within the active bar,
the bar-specific one wins - so you can override a shared default for just
one style if you need to.

**Toggle keys.** RuneScape's own weapon-swap keybind is often a single key
that toggles between exactly two loadouts, and which two styles that
represents changes fight to fight (melee/magic one boss, melee/ranged the
next). To match that: give two or three bars the *same* weapon-trigger
key, then use the checkbox next to each bar's name to switch off whichever
one you're not using this session. That key then toggles only between the
bars still switched on - flip the checkboxes between fights instead of
re-entering keybinds. A greyed-out bar keeps everything it's bound to and
can still be selected manually; it's only left out of automatic switching
while off.

**Showing the weapon on swap.** A weapon-trigger key (or the cycle key) can
also have an ordinary keybind of its own, bound on the style bar it's
switching *from* - e.g. add "Fractured staff of Armadyl" under Melee's tab,
on the same key Melee uses to trigger-switch to Magic. Pressing that key
then shows that icon on the overlay *and* switches styles, the same way
RuneScape's own weapon-swap key both re-equips your weapon and changes your
abilities. Bind something on the Magic side too, on the same key, and
swapping back the other way shows that one instead - each direction can
show its own icon, or neither, independently.

**If you only ever play one style**, none of this needs any attention -
with no style bars added, keybinds work exactly like a single flat list.

## What this tool does (and doesn't do)

This app only listens for keyboard/mouse events at the OS level (via
`uiohook-napi`, the same category of library any hotkey utility,
macro-remap tool, or streaming software with global hotkeys uses) and
displays what you pressed in its own separate overlay window. Specifically,
it:

- **Does not** read the RuneScape client's memory
- **Does not** read pixels from the game window
- **Does not** inject synthetic keypresses, clicks, or any other input
- **Does not** communicate with Jagex's servers in any way
- **Is not aware the game exists** - it only observes physical key/mouse
  events you generate yourself, for display purposes

It's a passive input logger paired with a local overlay renderer, not a
bot or macro (which would read game state and inject input to act on your
behalf). That said, this is a standalone tool, not built on the
[Alt1 Toolkit](https://runeapps.org/alt1) - a third-party overlay/plugin
system (not made by Jagex) that Jagex has explicitly given permission to
use, and which RotationMaster itself is built on. Because this app isn't
an Alt1 plugin, it doesn't inherit that explicit sanctioning. Whether a
given third-party tool is acceptable under Jagex's Rules of RuneScape and
third-party software policy is a question for Jagex, not something this
README can answer on their behalf - if you're unsure, check their current
policy or ask them directly before relying on this for anything beyond
personal use.

This project also doesn't simulate RuneScape's global cooldown or
per-ability cooldowns (the original LeMageTank tracker did). It shows
every keybind press immediately - client-side key detection can't
actually know true in-game cooldown state anyway (a failed cast, a stun,
or a misclick would all make a simulated cooldown wrong), so showing what
was actually pressed doesn't claim an accuracy the app can't back up.

## Ability, weapon & perk data

`data/abilityinfo.json` (986 items) and `data/icons/` are both built from
[RotationMaster](https://github.com/cuddlyzebra/RotationMaster)'s bundled
icon library via `scripts/build-ability-data.py`. Every entry - ability,
weapon, jewellery, book, or perk - is treated the same way by the app: a
name, a category tag, an icon, bindable to any key.

| Tag | Count | What |
|---|---|---|
| `melee` / `ranged` / `magic` / `necromancy` / `defence` / `unlockable` | 342 | Combat abilities |
| `melee-gear` / `ranged-gear` / `magic-gear` / `necromancy-gear` | 489 | Weapons & armour (undyed base items) |
| `jewellery` | 48 | Rings, amulets & necklaces (Reaver's/Stalker's/Champion's ring, Essence of Finality, Am-hej, etc.) |
| `pocket` | 33 | Book-slot items, scriptures, scrimshaws, grimoires & auras (Books of Zaros/Death/Guthix/Zamorak/Armadyl/Bandos/Saradomin, Scripture of Ful/Wen/Jas/Bik/Amascut, Erethdor's grimoire, etc.) |
| `perk` | 70 | Invention perks |
| `consumable` | 4 | Combat-support consumables & single-button actions (Vulnerability bomb, Saradomin brew, Super saradomin Brew, the generic Summoning special-attack trigger - see [Roadmap](#roadmap--not-built-yet)) |

RotationMaster is actively maintained and already reflects RuneScape's
March 2026 "Combat Style Modernisation" rework (many old abilities removed,
new ones like Rend and Adaptive Strike added) - a more reliable source than
hand-transcribing wiki pages, and since name + icon come from the same
place, there's no separate matching step to get wrong. Coverage on the 342
combat abilities is 100% - including a handful RotationMaster itself leaves
uncategorised (Berserk, Decimate, Vanquish (magic), Vulnerability spell,
Channeller's ring, and both Essence of Finality amulet entries), recovered
via `scripts/ability-category-overrides.json` rather than silently dropped.

To rebuild after RotationMaster's data changes (e.g. a future combat
rework):

```bash
python3 scripts/build-ability-data.py /path/to/RotationMaster/src/assets/abilities.json
```

### Dyed weapons & armour

Dyeing a weapon or armour piece in RuneScape creates a genuinely different
item, not a cosmetic skin - so full coverage needs a distinct icon per
item per dye colour. RotationMaster doesn't track these at all, but the
RS3 wiki does have a distinct image per dyed variant.

**If you just downloaded a release, there's nothing to do** - the fetched
icons (`data/icons/dyed/`) and data (`data/dyed-abilityinfo.json`) are
already bundled into every packaged build, so dyed weapons and armour are
searchable the moment you open the app, same as everything else.

The fetching itself is only relevant if you're building from source or
maintaining the project - e.g. after RuneScape adds a new dyeable item and
the bundled data needs extending. That's done with:

```bash
node scripts/fetch-dyed-icons.js
```

No merge step needed afterwards - it downloads any new icons into
`data/icons/dyed/`, writes `data/dyed-abilityinfo.json`, and
`electron/abilityData.js` merges that into the main list live, every time
the app starts, so a restart is all it takes to see the result. The script
covers the ~32 tier-90+ dyeable weapons and 25 dyeable armour pieces
across melee/ranged/magic/necromancy, in the colours shadow, soul, blood,
ice, barrows, aurora, and third age (`scripts/dye-weapons-manifest.json`
lists them all - extend that file first if RuneScape adds new ones). It
only keeps combinations that actually exist on the wiki, is safe to re-run
any time, and is incremental - it never re-downloads what it already has,
and never discards previous results even if a run gets interrupted or
rate-limited.

**Licensing note**: this project's own code is MIT-licensed (see
[License](#license)), but that doesn't extend to material pulled in from
elsewhere:

- RotationMaster's data (`data/icons/`, `data/abilityinfo.json`) comes from
  a repo with no `LICENSE` file. Without an explicit license, default
  copyright applies to that material regardless of what license this repo
  uses.
- The dyed-weapon icons (`data/icons/dyed/`, `data/dyed-abilityinfo.json`)
  come from runescape.wiki (Weird Gloop) - not bundled by this repo, only
  downloaded locally by the script above unless a maintainer chooses to
  commit them.
- Both ultimately trace back to RuneScape 3 game assets (Jagex's IP),
  which sit outside any of these repos' licenses entirely.

Not a lawyer, so treat this as a heads-up rather than legal advice - worth
a quick check with the relevant maintainers, or Jagex's asset-use policy,
before any of this goes beyond personal/local use.

---

## Roadmap / not built yet

**Known issue:** the NSIS installer build (`PvM Pulse Setup <version>.exe`)
had a packaging bug in an earlier beta where an installed copy's combat
abilities didn't load (dyed gear did) - the portable build was unaffected.
Root cause not yet confirmed, so the installer target is disabled for now
(see [Building a distributable](#building-a-distributable)); only the
portable `.exe` is published until this is tracked down. If you can
reproduce it, an installed copy's logs (run the installed `.exe` with
`--enable-logging` from a terminal, or check `electron/main.js`'s console
output for an `abilities:list failed` line) would help narrow it down.

Community-requested features, roughly in priority order:

- **Starter profile** - the mechanism exists (see
  [Building the starter profile](#building-the-starter-profile)) but
  `data/starter-profile.json` itself hasn't been built yet, so new installs
  still open empty for now.
- **Custom icon overrides** - pick your own image for any ability, weapon,
  or perk, overriding the bundled icon (or filling a gap where there isn't
  one, e.g. an uncovered dye colour).
- **Update notifications** - check this repo's releases on startup and
  notify if a newer version is available.
- **Mouse-click (action bar slot) bindings** - this app currently focuses
  on keyboard bindings; mouse-click zones would need a lighter-weight
  version of the original tracker's screen-region picker.
- **APM counter / extension system** - the original tracker's second
  "extension"; not ported yet.
- **Perk "modifier" display** - perks are bindable/searchable now, but
  shown as plain entries rather than composited as a small badge on a
  weapon's icon, the way in-game gizmo perks visually attach to gear.
- **A second Vulnerability bomb** - RotationMaster's source data only has
  one `Vulnerability bomb` entry; if there's a distinctly-named
  higher-tier version in-game, it needs its own icon/entry added upstream
  or via `scripts/ability-category-overrides.json` once confirmed.
- **Three Essence of Finality colour variants have odd display names** -
  `Decimation EoF`, `Dark bow EoF`, and `Statius's warhammer EoF` are
  RotationMaster's own (Discord-emote-derived) names for what are likely
  the purple/yellow/black amulet colours, inconsistent with the other four
  (`Essence of Finality (blue/green/pink)`, `... amulet (red)`) - worth
  relabelling for consistency once someone can confirm the actual in-game
  colour each one is.
- **`consumable` tag is a hand-picked shortlist** - Vulnerability bomb,
  Saradomin brew, Super saradomin Brew, and the generic Summoning
  special-attack trigger so far (RotationMaster's much larger
  "Consumables, Currencies, and Combat Support Items" and "Summoning"
  categories aren't pulled in wholesale, since most of that - regular
  potions, currency, familiar pouches/scrolls themselves - isn't really a
  "press key mid-fight, see it on the overlay" item the way these are);
  extend `scripts/ability-category-overrides.json` per-item as more are
  wanted.

Have an idea, or want to pick one of these up? Open an issue or a PR - see
[Contributing](#contributing--building-from-source) below.

## Contributing / building from source

PvM Pulse is **open source (MIT-licensed) and open to contributions** -
if you find a bug, want a feature from the roadmap above, or just want to
poke around, PRs and issues are welcome. No permission needed to fork and
run with it.

### Project layout

```
electron/            Main process (Node) - runs outside the browser sandbox
  main.js             App entry point, wires everything together
  preload.js          Safe bridge exposing window.tracker to the UI
  inputListener.js     Global keyboard hook (uiohook-napi) -> resolves keybinds -> ability casts
  overlayServer.js     Local HTTP+WebSocket server for the OBS overlay page
  profileStore.js      Loads/saves the user's saved profiles (cross-platform paths, multiple named profiles)
  abilityData.js        Loads + merges data/abilityinfo.json with data/dyed-abilityinfo.json

overlay/              What OBS's Browser Source actually loads
  index.html / overlay.js / overlay.css   Live, animated, transparent-background overlay

src/                  The setup UI (React, runs in the Electron window)
  App.tsx              Main screen: search abilities, bind keys, style bars, overlay URL + live preview
  components/          KeybindRow, StyleBarPanel, KeyCaptureButton, OverlayLinkPanel, LivePreview

data/                 Ability/weapon/perk data + icons, built from RotationMaster (see above)
scripts/              build-ability-data.py, fetch-dyed-icons.js, and their supporting files
```

### Building the starter profile

New installs currently open to a totally empty keybind list, which is a lot
to face before you've bound a single key - search-and-add 342 abilities one
at a time with nothing pre-filled. `electron/profileStore.js` supports
shipping a **starter profile** to soften that: `data/starter-profile.json`,
if present, is what a brand-new install loads instead of an empty profile
(nothing changes if it's absent - this is purely additive).

This isn't auto-generated from `data/abilityinfo.json`, deliberately - that
data (sourced from RotationMaster) mixes real, current abilities with
deprecated `OLD...`-prefixed entries, internal `snake_case` duplicate IDs,
and placeholder entries (`Melee`, `Attack`, `Necromancy (Auto)`, etc.), so
dumping "every melee-tagged item" onto a page would hand new players a
list that's just as confusing as an empty one, in a different way. Building
it needs an actual current-meta player's judgement call on which abilities
belong.

To build one: open the app, add a style bar per combat style you want to
pre-fill (Melee/Ranged/Magic/Necromancy, say), search-and-add the real
abilities that belong on each - **without pressing a key for any of
them**, so they show up as "Press key…" placeholders rather than presets
that might not match how the next person actually plays - then use
**Export Profile…** and save the result as `data/starter-profile.json` in
the repo. Anything genuinely style-agnostic (defensives, movement) can go
on the "Shared" tab the same way. Since `data/**/*` is already bundled by
`electron-builder` (see `package.json`'s `build.files`), no packaging
config changes are needed once the file exists - it just starts working.

### Running from source (Windows)

1. Install [Node.js](https://nodejs.org) (LTS).
2. Clone the repo and open a terminal in the folder that contains
   `package.json`.
3. `npm install`. If npm warns that `electron`, `uiohook-napi`, or
   `esbuild` have install scripts pending approval (a newer npm safety
   feature), approve them - they're legitimate (Electron's browser binary,
   the native keyboard-hook binary, and esbuild's native bundler binary):
   ```
   npm install-scripts approve electron
   npm install-scripts approve esbuild
   npm install-scripts approve uiohook-napi
   npm install
   ```
4. `npm run dev` - starts the setup window with hot reload.
5. `npm run typecheck` - runs the TypeScript compiler without emitting,
   useful before opening a PR.

macOS/Linux should work the same way (`npm install && npm run dev`) since
everything is cross-platform Electron/Node, but only Windows has been
built and tested end-to-end so far - reports and PRs for other platforms
welcome.

### Building a distributable

```
npm run package
```

Bundles Node, Electron, and everything the app needs into a standalone
binary under `/release`. On Windows this currently produces just:

- `PvM Pulse <version>.exe` - portable, single-file

(`package.json`'s `build.win.target` also supported an NSIS installer
build earlier on, but it's disabled for now after a packaging bug where an
installed copy's combat-ability list didn't load correctly while the
portable build was fine - see [Roadmap](#roadmap--not-built-yet). Add
`{ "target": "nsis", "arch": ["x64"] }` back to that array to re-enable it
once that's diagnosed.)

The first run takes longer than `npm install`, since `electron-builder`
downloads its own packaging tools - needs internet access, no further
input required.

## License

MIT - see [LICENSE](LICENSE). Free to use, modify, and redistribute. See
[the licensing note above](#dyed-weapons--armour) for the caveats that
apply to bundled RotationMaster/wiki data specifically, which this
project's MIT license doesn't retroactively cover.

## Credits

- [LeMageTank's RS3 Ability Tracker](https://github.com/LeMageTank/LMT-RS3-Ability-Tracker) -
  the original tool this project takes its inspiration from.
- [RotationMaster](https://github.com/cuddlyzebra/RotationMaster) - source
  of the core ability/weapon/perk data and icon set.
- [The RuneScape Wiki](https://runescape.wiki) - source of dyed-weapon and
  dyed-armour icons.

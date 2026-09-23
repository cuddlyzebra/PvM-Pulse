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

> **This app is in beta.** It's actively used and maintained, but still
> young - please expect the occasional bug or rough edge. If you run into
> one, or anything is confusing, [open an issue](../../issues) - feedback
> (bug reports, feature requests, or just "this was confusing") is
> genuinely welcome and helps get it to a stable release faster.

---

## Contents

- [Features](#features)
- [Installing (no coding required)](#installing-no-coding-required)
  - [Windows](#windows)
  - [macOS](#macos)
  - [Linux (coding required)](#linux-coding-required)
- [Quick start](#quick-start)
- [Using the app](#using-the-app)
  - [The header](#the-header)
  - [The three panels](#the-three-panels)
  - [Click zones (advanced)](#click-zones-advanced)
  - [Keyboard shortcuts](#keyboard-shortcuts)
  - [Troubleshooting](#troubleshooting)
- [Style bars](#style-bars)
- [Checking for updates](#checking-for-updates)
- [What this tool does (and doesn't do)](#what-this-tool-does-and-doesnt-do)
- [Ability, weapon & perk data](#ability-weapon--perk-data)
  - [Extra consumables](#extra-consumables)
  - [Dyed weapons & armour](#dyed-weapons--armour)
- [Roadmap / not built yet](#roadmap--not-built-yet)
- [Contributing / building from source](#contributing--building-from-source)
  - [Building the starter profile](#building-the-starter-profile)
  - [Running from source (Windows)](#running-from-source-windows)
  - [Building a distributable](#building-a-distributable)
- [Changelog](#changelog)
- [License](#license)
- [Credits](#credits)

---

## Features

- **No calibration for keybinds.** Search for an ability, click "Press
  key…", press the key. No screenshot wizards, no typing raw keycodes.
  (Click zones are the one exception - see
  [Click zones (advanced)](#click-zones-advanced).)
- **Live overlay, not a polled image.** A local WebSocket server pushes
  every cast to the overlay the instant you press the key - no flicker, no
  lag waiting for OBS to notice a changed file.
- **1030+ bindable items**: every current combat ability across all styles,
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
- **Pause tracking.** One click freezes the keyboard hook entirely - handy
  right before typing a password or a private message on stream, so
  nothing you type shows up on the overlay for a viewer to piece together.
- **Click zones (advanced).** For players who click abilities instead of
  pressing a key - bind an ability to a spot on screen instead of a key.
  Experimental and more fragile than a keybind by nature; see
  [Click zones (advanced)](#click-zones-advanced) below.
- **Spam-proof overlay.** Mashing (or holding) the same bound key won't
  flood the overlay with a duplicate icon for every press - repeats of the
  same ability within about a second of each other are collapsed into one.
  A genuine repeat after that window (or any different ability at any
  point) still shows normally.
- **Cross-platform**: Windows, macOS, and Linux (via Electron); packaged
  Windows builds need no Node/npm at all for end users.
- **Update checks, never forced.** The app quietly checks GitHub for a
  newer release and shows a small dismissible banner if one exists - it
  never downloads or installs anything on its own. See
  [Checking for updates](#checking-for-updates) below.
- **Honest about what it does.** See
  [What this tool does (and doesn't do)](#what-this-tool-does-and-doesnt-do).

---

## Installing (no coding required)

### Windows

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

### macOS

1. Grab the right **`.dmg`** from the [latest release](../../releases/latest)
   - two are published, one per Mac chip type:
   - **`PvM Pulse <version>-arm64.dmg`** - Apple Silicon Macs (M1/M2/M3/M4 -
     most Macs sold since late 2020).
   - **`PvM Pulse <version>-x64.dmg`** - older Intel Macs.
   - Not sure which you have? **Apple menu (top-left) → About This Mac** -
     it'll say either "Chip: Apple M___" (get the arm64 one) or
     "Processor: Intel ___" (get the x64 one).
   - Open the `.dmg` and drag **PvM Pulse** into your **Applications**
     folder.
2. macOS will refuse to open it the normal way and say it's "damaged" or
   from an "unidentified developer" - it isn't damaged, it's just not
   signed with a paid Apple Developer certificate (same reasoning as the
   Windows SmartScreen warning above). To open it anyway: right-click (or
   Control-click) **PvM Pulse.app** in Applications, choose **Open**, then
   confirm **Open** in the dialog that appears. You only need to do this
   once - after that it opens normally.
   - If macOS still refuses, open **Terminal** and run
     `xattr -cr /Applications/PvM\ Pulse.app`, then try opening it again.
3. macOS will also ask for **Accessibility** permission the first time -
   this is what lets it detect your keypresses to trigger the overlay (the
   same reason the Windows build trips antivirus software - see
   [What this tool does (and doesn't do)](#what-this-tool-does-and-doesnt-do)).
   Grant it in **System Settings → Privacy & Security → Accessibility**,
   then restart the app.

### Linux (coding required)

There's no pre-built Linux download yet - getting it running means building
it yourself from a terminal. It's not complicated, just more steps than
double-clicking a download; roughly 10 minutes even if you haven't done
this before.

1. **Install prerequisites** (once per machine):
   - **Node.js** (LTS) - via your distro's package manager, [nodejs.org](https://nodejs.org),
     or [nvm](https://github.com/nvm-sh/nvm).
   - **Build tools**, needed to compile the keyboard-hook module on some
     setups:
     - Debian/Ubuntu and derivatives (Mint, Pop!_OS, etc.):
       `sudo apt install build-essential python3 libx11-dev libxtst-dev libxkbcommon-dev`
     - Fedora:
       `sudo dnf install gcc-c++ make python3 libX11-devel libXtst-devel libxkbcommon-devel`
     - Arch/Manjaro:
       `sudo pacman -S base-devel python libx11 libxtst libxkbcommon`
     - Other distros: the equivalent packages for a C compiler, `make`,
       `python3`, and the X11/XTest/xkbcommon development headers.
2. **Get the code**:
   ```bash
   git clone https://github.com/cuddlyzebra/PvM-Pulse.git
   cd PvM-Pulse
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
   If npm warns about install scripts pending approval for `electron`,
   `uiohook-napi`, or `esbuild`, approve them (see
   [Running from source](#running-from-source-windows) for why that's
   expected) and run `npm install` again.
4. **Run it**: `npm run dev` - opens the setup window directly, no
   packaging needed just to try it.
5. **Or build a portable AppImage** to keep around:
   ```bash
   npm run package
   ```
   Produces `release/PvM Pulse-<version>.AppImage`. Make it executable
   once (`chmod +x "release/PvM Pulse-<version>.AppImage"`), then just run
   it directly - no install step, no root needed.

**Wayland heads-up**: the global keyboard hook this app relies on to
detect your keybinds only works properly under an **X11** session. Most
distros now default to **Wayland**, which blocks apps from seeing
keypresses outside their own window for security reasons - so keybinds may
silently just not register. If that happens, log out and pick an
"X11"/"Xorg" session at the login screen (usually a small gear/settings
icon next to your username before you sign in), then try again.

This build path isn't tested end-to-end by the project maintainer (Linux
isn't their daily driver) - reports and PRs from Linux users are very
welcome if something above doesn't quite work on your distro.

### Both platforms

1. Open the app. That's it - no accounts, no config files to hand-edit.
2. Closing the window asks whether to **minimize to the system tray**
   (keeps tracking keybinds and serving the OBS overlay in the background -
   the normal choice while streaming) or **quit completely** (stops both;
   the overlay goes blank until you reopen the app). A tray icon appears
   either way - right-click it for Show/Quit, or just left-click to bring
   the window back. Only one copy of PvM Pulse runs at a time; opening it
   again while it's already running (e.g. double-clicking the app a second
   time) shows a prompt asking whether to bring the existing window forward,
   instead of silently starting - or silently refusing to start - a second
   copy.

## Quick start

1. **Find something to bind.** Type into the search box, or click a tag
   chip (e.g. `melee`) to narrow the list. Abilities, weapons, armour,
   jewellery, perks, and consumables are all searchable the same way.
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

## Using the app

A closer look at each part of the setup window, for anything the
[Quick start](#quick-start) above moved past quickly.

### The header

Above the panels: **Pause Tracking** (top left, outlined in red) instantly
stops the keyboard hook from seeing anything at all - no cast events, no
style switching, nothing reaches the overlay or the live preview until you
click it again. It turns solid red while paused, as a clear "nothing's
being tracked right now" indicator. Use it right before typing a password
or a private message while streaming, so there's nothing on screen for a
viewer to read back from your keypresses. To the right of that: Undo/Redo,
then Import/Export Profile - see [Quick start](#quick-start) for how those
two differ from the Profile switcher row just below the header.

### The three panels

The setup window is three panels side by side (they stack on a narrow
window):

**1. Find something to bind** - search and filter, on the left, covering
every ability, weapon, armour piece, jewellery item, perk, and consumable
the app knows about. Typing filters by name; the tag chips (`melee`,
`ranged`, `magic`, `gear`, `consumable`, etc.) filter by category, and can
be combined with a search term or with each other. Clicking an entry here
is how you *add* something to your keybind list - it doesn't bind a key by
itself, it just adds a "Press key…" placeholder row to panel 2, ready to
bind.

**2. Bind it** - in the middle, split into two tabs: **Keybinds** and
**Click zones**, so a long list of one doesn't push the other out of view.

- **Bind the key**: click **"Press key…"** on a row, then press whatever
  key you use for that ability in-game. It updates instantly - no
  confirm button.
- **Add a modifier**: the dropdown next to the key (shift/ctrl/alt), for
  binds like `Shift+1`.
- **Reorder**: drag a row by its handle (**⠿**) to move it several spots at
  once, or use the **▲/▼** buttons for a precise one-step nudge. Either way,
  this is just for your own tidiness - it has no effect on how anything is
  matched.
- **Swap the ability, keep the key**: click a row's **icon** (not its name)
  to change which ability it points to, without re-binding the key. A
  banner appears - search for the replacement in panel 1 and click it.
  Click **Cancel** in the banner to back out without changing anything.
- **Remove a row**: the **×** on the right. `Ctrl+Z` brings it back if that
  was a mistake.
- **Filter a long list**: once you have several binds, a search box appears
  above the list to filter *your own* keybinds (separate from panel 1's
  search, which searches *all* abilities).
- If you've added any [style bars](#style-bars), this panel shows one
  bar's binds at a time - the heading names which one, and the tabs above
  both panels switch between them.
- The **Click zones** tab is separate - see
  [Click zones (advanced)](#click-zones-advanced) below.

**3. Overlay** - on the right: the URL to paste into OBS (with a **Copy**
button), a live preview of what the overlay currently looks like (so you
can check it before ever opening OBS), and how many icons it shows at once
(4-14). Mashing the same bound key repeatedly only shows one icon per
second for it - a genuine repeat after that briefly-quiet window (or any
different ability at any point) still shows normally.

### Click zones (advanced)

For players who *click* their abilities in-game instead of pressing a key
for some (or all) of them. Panel 2's **Click zones** tab (next to
**Keybinds**) lets you bind an ability to a spot on your screen instead of
a keybind:

1. Click **+ Add click zone**, then pick the ability in panel 1, same as
   adding an ordinary keybind.
2. A banner tells you to click that ability's slot **in-game**. Do that -
   wherever you click is recorded as the zone's position.
3. Done. From then on, a real click landing near that spot casts the
   ability, exactly like a bound key would - including respecting
   [style bars](#style-bars) (a zone can be shared or bar-specific, same as
   a keybind) and the same one-per-second spam guard.

This is genuinely **experimental**, and more fragile than a keybind on
purpose: a keybind works no matter what's on screen, but a click zone only
works while your in-game ability bar stays in exactly the same screen
position. If you move it, resize it, rescale your UI, or switch monitors,
every zone bound near it stops lining up - click **Re-pick location** on
that row and click the slot again to fix it. The **±px** field controls how
close a click has to land to still count, in case your aim (or a slightly
moved bar) isn't pixel-perfect.

Click zones live alongside keybinds, not instead of them - an ability can
have a keybind, a click zone, both, or neither.

Like a keybind row, a click zone row can be **reorganized** and have its
**ability swapped**, both without touching its screen position:

- **Reorder**: drag a row by its handle (**⠿**), or use the **▲/▼** buttons
  for a one-step nudge. Purely for keeping a long list organized - order
  has no effect on which zone a real click matches.
- **Change the ability**: click a row's icon, pick the replacement ability
  in panel 1 - the zone's position and **±px** radius stay exactly as
  they were, only the ability (and which icon/overlay entry it produces)
  changes.

### Keyboard shortcuts

| Shortcut | Does what |
|---|---|
| **Pause Tracking** button (header, top left) | Freezes the keyboard hook - nothing reaches the overlay until clicked again |
| `Ctrl+Z` | Undo the last change (a keybind edit, a deleted style bar, anything) |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| Double-click a style bar's tab name | Rename that bar |
| Click **"Press key…"**, then press any key | Bind that key (works for ordinary keybinds, weapon-trigger keys, and the cycle key alike) |
| **+ Add click zone**, then click an ability, then click its slot in-game | Bind that ability to a screen position instead of a key |

### Troubleshooting

**Nothing shows up on the OBS overlay.** Check, in order: the URL in OBS's
Browser Source matches exactly what's shown under "3. Overlay" in the app
(re-copy it if unsure); the Browser Source's width/height in OBS isn't set
to `0` or something tiny; PvM Pulse is actually still running (check the
system tray icon - if you chose **quit completely** last time you closed
it, the overlay goes blank until you reopen the app).

**A keybind isn't triggering.** Check: you're on the right tab for it (a
bind on "Melee" only fires while Melee's bar is active - see
[Style bars](#style-bars) if that's unfamiliar); the key shown on the
button is actually the key you're pressing (click it and re-press to be
sure); and that RuneScape (or whatever's fullscreen) isn't running in a
mode that blocks other apps from seeing keypresses, which some games'
exclusive-fullscreen modes do - try windowed or borderless fullscreen.

**I deleted something by accident.** `Ctrl+Z` immediately - it covers
keybind edits, deleted style bars, and settings changes alike.

**Switching profiles didn't carry my keybinds over.** That's expected -
profiles are fully separate on purpose (one per character, one per boss
loadout). To copy binds across, use **Duplicate** on the profile you want
to start from, or **Export Profile…** on one and **Import Profile…** into
the other - see [Quick start](#quick-start) for both.

## Style bars

If you play multiple combat styles in the same fight (melee/ranged,
melee/magic, etc.) and reuse the same physical keys for different
abilities per style - "D" being Wild Magic on a magic bar but Greater
Flurry on a melee bar, say - **style bars** solve that. Each bar has its
own keybinds, and only one is "active" (read by the tracker) at a time.

**Setup:**

1. Click **"+ Add style bar"** once per style you use (e.g. "Melee",
   "Ranged", "Magic"). Already have one bar set up the way you like and
   want a variant of it (same keys, different boss) instead of starting
   from scratch? Click the **⧉** button next to its name to duplicate it -
   name, weapon-trigger key, and every keybind on it all get copied onto
   the new bar, ready to tweak.
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

## Checking for updates

A few seconds after launch, the app quietly checks
[GitHub Releases](../../releases) for a version newer than the one you're
running. If one exists, a small banner appears at the top of the window:

- **View release** opens the release page (or, if a Windows `.exe`/`.zip`
  is attached to it, downloads that directly) in your regular browser.
- **Skip this version** dismisses it for good - it won't come back unless
  an even newer version is published later.
- **✕** dismisses it just for this session - it'll show again next launch
  if you haven't updated yet.

You can also check on demand any time, without waiting for the automatic
check: **Check for updates** at the bottom of the window, or **Check for
Updates…** in the tray icon's right-click menu (works even if the setup
window is closed/minimized to tray).

This never downloads or installs anything by itself - there's no
auto-updater silently replacing the `.exe` in the background. That's a
deliberate choice: this app is an unsigned portable build with no
code-signing certificate, so it has no trustworthy way to verify a
downloaded update before running it. Grabbing the new version is left to
you, the same way you got this one. If there's no internet connection, or
GitHub can't be reached, or no release has been published yet, the check
just fails silently - it never shows an error or gets in the way of using
the app.

Update checks only work against
`https://github.com/cuddlyzebra/pvm-pulse` - a fork running its own
source needs to change `REPO_OWNER`/`REPO_NAME` in
`electron/updateChecker.js` (or the checks will just 404 forever, which is
harmless but pointless) to point at its own GitHub Releases instead.

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

`data/abilityinfo.json` (1024 items) and `data/icons/` are both built from
[RotationMaster](https://github.com/cuddlyzebra/RotationMaster)'s bundled
icon library via `scripts/build-ability-data.py`. Every entry - ability,
weapon, jewellery, book, prayer, or perk - is treated the same way by the
app: a name, a category tag, an icon, bindable to any key.

| Tag | Count | What |
|---|---|---|
| `melee` / `ranged` / `magic` / `necromancy` / `unlockable` | 300 | Combat abilities |
| `defence` | 79 | Style-agnostic defensives, including all six Protect from/Deflect prayers and curses (melee/ranged/magic), plus Augury, Rigour, Piety, Turmoil, Soulsplit, and the rest of RotationMaster's "Prayers" category |
| `melee-gear` / `ranged-gear` / `magic-gear` / `necromancy-gear` | 489 | Weapons & armour (undyed base items) |
| `jewellery` | 48 | Rings, amulets & necklaces (Reaver's/Stalker's/Champion's ring, Essence of Finality, Am-hej, etc.) |
| `pocket` | 33 | Book-slot items, scriptures, scrimshaws, grimoires & auras (Books of Zaros/Death/Guthix/Zamorak/Armadyl/Bandos/Saradomin, Scripture of Ful/Wen/Jas/Bik/Amascut, Erethdor's grimoire, etc.) |
| `perk` | 70 | Invention perks |
| `consumable` | 10 | Combat-support consumables & single-button actions: Vulnerability bomb, Saradomin brew, Super saradomin Brew, the generic Summoning special-attack trigger (from RotationMaster), plus Prayer potion, Prayer flask, Super restore potion, Super restore flask, Spiritual prayer potion & Blessed flask (hand-added - see [Extra consumables](#extra-consumables) below) |
| `teleport` | 1 | War's Retreat Teleport - RS3's community "PvM hub"; a hand-picked start, not all of RotationMaster's much larger "Teleports" category (lodestones etc.) - extend `scripts/ability-category-overrides.json` per-item as more are wanted |

RotationMaster is actively maintained and already reflects RuneScape's
March 2026 "Combat Style Modernisation" rework (many old abilities removed,
new ones like Rend and Adaptive Strike added) - a more reliable source than
hand-transcribing wiki pages, and since name + icon come from the same
place, there's no separate matching step to get wrong. Coverage on the 379
combat abilities and defensives is 100% - including a handful RotationMaster
itself leaves uncategorised (Berserk, Decimate, Vanquish (magic),
Vulnerability spell, Channeller's ring, both Essence of Finality amulet
entries, and War's Retreat Teleport), recovered via
`scripts/ability-category-overrides.json` rather than silently dropped.

To rebuild after RotationMaster's data changes (e.g. a future combat
rework):

```bash
python3 scripts/build-ability-data.py /path/to/RotationMaster/src/assets/abilities.json
```

### Extra consumables

Six utility potions/flasks - **Prayer potion**, **Prayer flask**, **Super
restore potion**, **Super restore flask**, **Spiritual prayer potion**, and
**Blessed flask** - aren't in RotationMaster's data at all, so they live in
their own file, `data/extra-abilityinfo.json`, merged into the ability list
live by `electron/abilityData.js` (same pattern as the dyed items below,
and for the same reason: a future `build-ability-data.py` rebuild
overwrites `data/abilityinfo.json` wholesale, and hand-added entries baked
directly into that file would get silently wiped out by that).

**If you just downloaded a release, there's nothing to do** - same as dyed
items, this is already bundled in.

Their icons (`data/icons/prayerpot.webp` and friends) are the real RS3
wiki art, cropped and scaled down to match the other small potion icons
(e.g. `brew.webp`) already in that folder.

To add another hand-picked item the same way, add an entry to
`data/extra-abilityinfo.json` (`action`, `tag`, `icon` - matching
`data/abilityinfo.json`'s shape) and drop its icon file into `data/icons/`.

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
- The extra-consumables icons (`data/icons/prayerpot.webp` and friends)
  also come from runescape.wiki (Weird Gloop), cropped/scaled down by hand
  rather than by the fetch script above - same sourcing as the dyed-weapon
  icons, just bundled directly rather than fetched on demand.
- All of the above ultimately trace back to RuneScape 3 game assets
  (Jagex's IP), which sit outside any of these repos' licenses entirely.

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
- **APM counter / extension system** - the original tracker's second
  "extension"; not ported yet.

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
to face before you've bound a single key - search-and-add 379 abilities one
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

**macOS builds don't run this locally** - Apple only allows building/
signing a `.app`/`.dmg` on a real Mac, and this project isn't developed on
one. Instead, `.github/workflows/build-mac.yml` builds it on GitHub's own
macOS runners:

- Push a tag like `v1.1.0-beta.1` and it builds the `.dmg` and attaches it
  straight onto the matching GitHub Release automatically.
- Or trigger it by hand from the **Actions** tab (**Build macOS app → Run
  workflow**) to get it as a downloadable build artifact on that run
  instead, without needing a tag/release to already exist.

It's unsigned (no paid Apple Developer account behind this project), so
macOS shows an "unidentified developer" warning on first open - see
[Installing → macOS](#macos) for how to get past that.

## Changelog

### 1.1.0-beta.1

- Reordering keybinds is back to drag-and-drop, refined to fix a direction
  bug (it previously needed a second, opposite drag to land correctly) -
  the ▲/▼ buttons stay too, for one-step nudges.
- Fixed drag-and-drop not registering at all in some cases (an Electron/
  Chromium quirk).
- The **Save Profile** button no longer flickers/resizes on every autosave
  - it's silent now.
- You can change a keybind's ability without losing its key: click the
  icon on a bound row, search for the replacement, click it.
- A newly added keybind scrolls into view automatically instead of getting
  lost below the fold.
- The "Find an ability" and "Bind a key" panels now grow to use extra
  space on a maximized/fullscreened window, and get their own scrollbar
  (instead of the whole app scrolling) on a smaller window.
- Added Protect from/Deflect prayers and curses (melee/ranged/magic), plus
  the rest of RotationMaster's Prayers category (Augury, Rigour, Piety,
  Turmoil, Soulsplit, etc.), and War's Retreat Teleport (the PvM hub) -
  total is now 1024 bindable items, up from 986.
- New: **Pause Tracking** button (top left of the header, red) - instantly
  freezes the keyboard hook so nothing reaches the overlay, e.g. before
  typing a password or a private message on stream.
- Mashing or holding the same bound key now only shows its icon once on
  the overlay, instead of flooding it with duplicates.
- Style bars can now be duplicated (**⧉** button next to a bar's name) -
  copies its name, weapon-trigger key, and all its keybinds onto a new
  bar, handy as a starting point for a variant.
- New: **macOS support** - see [Installing → macOS](#macos).
- New: **Linux** build-from-source instructions - see
  [Installing → Linux](#linux-coding-required).
- New: **update checks** - see
  [Checking for updates](#checking-for-updates).
- Click zones now support the same **drag-and-drop/▲▼ reordering** and
  **change-ability-without-losing-position** that keybinds already had -
  see [Click zones (advanced)](#click-zones-advanced).
- Added 6 utility consumables: Prayer potion, Prayer flask, Super restore
  potion, Super restore flask, Spiritual prayer potion, and Blessed flask -
  see [Extra consumables](#extra-consumables). Total is now 1030 bindable
  items, up from 1024.
- Panel 1's heading is now "Find something to bind" (covering abilities,
  weapons, armour, jewellery, perks, and consumables alike, without
  listing them all out), and the header's "no calibration required" line
  now calls out click zones as the one exception (they do need a one-time
  screen-position pick).

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

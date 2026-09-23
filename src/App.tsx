import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AbilityInfo,
  CastEvent,
  ClickZone,
  KeyChord,
  Keybind,
  Profile,
  SavedProfileSummary,
  StyleBar,
  UpdateCheckResult
} from './types';
import ClickZoneRow from './components/ClickZoneRow';
import KeybindRow from './components/KeybindRow';
import LivePreview from './components/LivePreview';
import OverlayLinkPanel from './components/OverlayLinkPanel';
import ProfileSwitcher from './components/ProfileSwitcher';
import StyleBarPanel from './components/StyleBarPanel';
import UpdateBanner from './components/UpdateBanner';
import { iconUrl } from './iconUrl';

function makeStyleBarId() {
  return `bar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeClickZoneId() {
  return `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Upper bound of the "icons shown on overlay" setting (see the icon-count
// control near the bottom of the render, which clamps to this same value).
// The recentCasts buffer below is kept at this size too - it used to be
// hardcoded to 8, which meant raising the setting past 8 had nothing left
// in the buffer to actually show, even though OBS (fed separately over the
// WebSocket, not from this buffer) displayed the correct count fine.
const MAX_ICON_COUNT = 14;

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [overlayUrl, setOverlayUrl] = useState('');
  const [recentCasts, setRecentCasts] = useState<CastEvent[]>([]);
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [keybindSearch, setKeybindSearch] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  // Loaded from the main process (electron/abilityData.js) rather than
  // bundled at build time - that file merges in dyed weapons/armour
  // (data/dyed-abilityinfo.json) fresh on every app start, so anything
  // fetched via scripts/fetch-dyed-icons.js shows up here automatically,
  // even after the rest of the app gets updated. No import to keep in sync.
  const [abilities, setAbilities] = useState<AbilityInfo[]>([]);
  // Set only if listAbilities() itself rejects (a base-data load failure in
  // the main process) - not for an empty-but-successful result, which is a
  // normal state (e.g. no keybinds yet). Surfaced in the UI because this
  // used to fail as a silent, unhandled promise rejection - the search
  // panel would just stay empty forever with nothing in view to explain why.
  const [abilitiesError, setAbilitiesError] = useState<string | null>(null);
  // Saved profiles you can switch between from inside the app (see
  // ProfileSwitcher / electron/profileStore.js) - separate from `profile`
  // above, which holds the currently active one's actual content.
  const [savedProfiles, setSavedProfiles] = useState<SavedProfileSummary[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  // Lets a player instantly stop the global keyboard hook from seeing
  // anything - e.g. before typing a password or a private message on
  // stream, without a viewer being able to work out what was typed from
  // the (now frozen) overlay. electron/inputListener.js already had
  // pause/resume plumbing wired up for this from early on; this is what
  // actually exposes it as a button, rather than requiring a restart to
  // get keys seen again.
  const [paused, setPausedState] = useState(false);
  // Update-available banner - see electron/updateChecker.js. Only ever set
  // to a result where updateAvailable is true; a check that finds nothing
  // new (or fails - no internet, GitHub unreachable, etc.) just leaves this
  // null, silently. bannerDismissed is session-only ("not now" - it'll show
  // again next launch); "Skip this version" instead persists via
  // window.updates.skipVersion so it stays gone until a newer version ships.
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  async function togglePause() {
    if (paused) {
      await window.tracker.resume();
      setPausedState(false);
    } else {
      await window.tracker.pause();
      setPausedState(true);
    }
  }

  useEffect(() => {
    window.tracker.getProfile().then(setProfile);
    window.tracker.getOverlayUrl().then(setOverlayUrl);
    window.tracker.listAbilities().then(setAbilities).catch((err) => {
      console.error('Failed to load ability list:', err);
      setAbilitiesError(err?.message ?? String(err));
    });
    window.tracker.listSavedProfiles().then(({ activeProfileId: id, profiles }) => {
      setActiveProfileId(id);
      setSavedProfiles(profiles);
    });
    // Unforced - respects the "checked recently" throttle in
    // electron/updateChecker.js, so this is mainly here to learn the
    // running version for the footer below; the actual "new version found"
    // banner mostly arrives via the onUpdateAvailable push a few seconds
    // after launch instead (this covers it too, in case that already fired
    // before this listener was attached).
    window.updates.check({ force: false }).then((result) => {
      setAppVersion(result.currentVersion);
      if (result.ok && result.updateAvailable && result.latestVersion !== result.skippedVersion) {
        setUpdateResult(result);
      }
    });
    const unsubscribeCasts = window.tracker.onCastEvent((event) => {
      setRecentCasts((prev) => [event, ...prev].slice(0, MAX_ICON_COUNT));
    });
    // The active style bar can change from outside this window - a
    // weapon-trigger keybind fired in-game, or the cycle key - so mirror
    // those back into the UI (which bar's keybinds are shown, which tab is
    // highlighted) without going through the normal save flow, since the
    // main process already persists it (electron/main.js).
    const unsubscribeStyleBar = window.tracker.onStyleBarChanged((barId) => {
      setProfile((prev) => (prev ? { ...prev, activeStyleBarId: barId } : prev));
    });
    // Pushed once from the main process a few seconds after launch, only if
    // there's genuinely something newer that hasn't already been skipped -
    // see electron/main.js's bootstrap(). This is the passive path; a
    // person can also trigger checkForUpdates() below on demand.
    const unsubscribeUpdate = window.updates.onUpdateAvailable((result) => {
      setUpdateResult(result);
    });
    return () => {
      unsubscribeCasts();
      unsubscribeStyleBar();
      unsubscribeUpdate();
    };
  }, []);

  async function checkForUpdates() {
    setCheckingForUpdate(true);
    try {
      const result = await window.updates.check({ force: true });
      setCheckingForUpdate(false);
      if (result.ok && result.updateAvailable) {
        setBannerDismissed(false);
        setUpdateResult(result);
      } else if (result.ok) {
        window.alert(`You're up to date (v${result.currentVersion}).`);
      } else {
        window.alert("Couldn't check for updates right now - check your internet connection.");
      }
    } catch {
      setCheckingForUpdate(false);
      window.alert("Couldn't check for updates right now.");
    }
  }

  async function skipUpdateVersion() {
    if (!updateResult?.latestVersion) return;
    await window.updates.skipVersion(updateResult.latestVersion);
    setUpdateResult(null);
  }

  // Auto-saves shortly after any change, rather than requiring the person
  // to remember to click "Save Profile" before a new keybind actually goes
  // live - the global key listener (electron/inputListener.js) only learns
  // about keybind changes when profile:save fires, so without this, adding
  // an ability and pressing a key would silently do nothing until Save was
  // clicked, with no indication that step was still needed. The button
  // stays as an explicit/immediate option; this just means forgetting to
  // press it doesn't leave keybinds silently inert.
  const isFirstProfileLoad = useRef(true);
  useEffect(() => {
    if (!profile) return;
    if (isFirstProfileLoad.current) {
      isFirstProfileLoad.current = false;
      return;
    }
    setSaveState('saving');
    // Captures activeProfileId as of *this* render (the profile this edit
    // was actually made against) so the main process can tell, once this
    // arrives, whether the person has since switched to a different profile
    // - see the staleness check in electron/main.js's profile:save handler.
    const savingForProfileId = activeProfileId;
    const timeout = setTimeout(async () => {
      await window.tracker.saveProfile(profile, savingForProfileId);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 900);
    }, 400);
    return () => clearTimeout(timeout);
  }, [profile, activeProfileId]);

  // Undo/redo for profile edits (keybinds, style bars, settings) - added
  // because a misclick that's easy to make without noticing, like ticking
  // a keybind's "shared" checkbox, immediately moves that row to a
  // different tab rather than just changing something in place, so it can
  // look like the keybind vanished. Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo
  // and redo the last edit; the buttons in the header do the same thing.
  // Only routes edits made *through this UI* onto the stack (see
  // applyProfileChange below) - loading a different saved profile entirely
  // (switching, importing, creating) resets the history instead, since
  // undoing past that point would mean undoing into a different profile's
  // keybinds, which isn't what anyone pressing Ctrl+Z would expect.
  const undoStackRef = useRef<Profile[]>([]);
  const redoStackRef = useRef<Profile[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function syncUndoRedoAvailability() {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }

  function resetUndoHistory() {
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncUndoRedoAvailability();
  }

  // Use this (not setProfile directly) for anything the user did through
  // the UI that they'd expect Ctrl+Z to reverse - adding/removing/editing
  // a keybind, managing style bars, changing settings.
  function applyProfileChange(next: Profile) {
    if (profile) undoStackRef.current.push(profile);
    redoStackRef.current = [];
    syncUndoRedoAvailability();
    setProfile(next);
  }

  function undo() {
    if (!profile || undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop()!;
    redoStackRef.current.push(profile);
    syncUndoRedoAvailability();
    setProfile(previous);
  }

  function redo() {
    if (!profile || redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(profile);
    syncUndoRedoAvailability();
    setProfile(next);
  }

  // Global Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcut. Re-subscribed on every
  // profile change so the listener always closes over the current
  // undo()/redo() (and therefore the current `profile`), rather than a
  // stale one from whenever the effect first ran.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profile]);

  // Looked up once so KeybindRow doesn't need its own copy of the full
  // ability list just to show a thumbnail next to an already-bound ability.
  const abilityIconByName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of abilities) map[a.action] = a.icon;
    return map;
  }, [abilities]);

  // Every distinct tag present in the data (melee, ranged, magic,
  // necromancy, defence, unlockable, melee-gear, ranged-gear, magic-gear,
  // necromancy-gear, perk), shown as toggleable filter chips so a list this
  // size (897+ items once weapons/perks/dyed gear are included) is easy to
  // narrow.
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const a of abilities) tags.add(a.tag);
    return Array.from(tags).sort();
  }, [abilities]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  const filteredAbilities = useMemo(() => {
    // The full list (897+ items) is small enough to render in one go - no
    // cap. The list itself scrolls (see .ability-list in styles.css), so
    // browsing the whole roster just means scrolling rather than typing a
    // search term first.
    let list = abilities;
    if (activeTags.size > 0) {
      list = list.filter((a) => activeTags.has(a.tag));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      // Matches by name OR by tag, so typing "perk" or "melee-gear" works
      // as a quick filter too, not just clicking the chips below.
      list = list.filter(
        (a) => a.action.toLowerCase().includes(q) || a.tag.toLowerCase().includes(q)
      );
    }
    return list;
  }, [abilities, search, activeTags]);

  // Whether the keybind list is showing the "Shared" pseudo-tab rather than
  // a real style bar. This is purely a view/editing filter, separate from
  // profile.activeStyleBarId (which bar is actually "live" for the input
  // listener) - shared keybinds are always live regardless of which bar is
  // active, so looking at them here doesn't change anything at runtime.
  // Exists because otherwise shared and bar-specific keybinds are mixed
  // together in every bar's view with no way to see just one or the other,
  // which gets hard to keep organized once a profile has many of both.
  const [viewingShared, setViewingShared] = useState(false);

  // Which of the two binding types panel 2 is currently showing. Split into
  // separate tabs (rather than one long stacked list) because a player who
  // mostly or entirely uses click zones would otherwise have to scroll past
  // a whole keybind list - often a long one - to reach them, and vice versa.
  const [bindingTab, setBindingTab] = useState<'keys' | 'clicks'>('keys');

  const filteredKeybinds = useMemo(() => {
    if (!profile) return [];
    const withIndex = profile.keybinds.map((kb, index) => ({ kb, index }));
    // Once style bars exist, each tab shows ONLY its own keybinds - a real
    // bar's tab shows just that bar's specific keybinds, and the "Shared"
    // tab shows just the shared ones, fully separated for readability.
    // This is purely a display/editing split: at runtime (see
    // electron/inputListener.js), shared keybinds are still live no matter
    // which bar is active - hiding them from a bar's list here doesn't
    // change what's actually being tracked, only what you're looking at.
    let barFiltered = withIndex;
    if (profile.styleBars.length > 0) {
      barFiltered = viewingShared
        ? withIndex.filter(({ kb }) => !kb.styleBarId)
        : withIndex.filter(({ kb }) => kb.styleBarId === profile.activeStyleBarId);
    }
    const q = keybindSearch.trim().toLowerCase();
    if (!q) return barFiltered;
    return barFiltered.filter(
      ({ kb }) => kb.ability.toLowerCase().includes(q) || kb.key.toLowerCase().includes(q)
    );
  }, [profile, keybindSearch, viewingShared]);

  // Clicking a keybind row's icon requests swapping which ability that row
  // points at, without touching its key/modifier/shared setting - see
  // requestChangeAbility below. Non-null while that's in progress: the
  // ability list (panel 1) shows a banner and the next ability clicked there
  // fills in here instead of creating a new keybind.
  const [replacingKeybindIndex, setReplacingKeybindIndex] = useState<number | null>(null);

  // Set right after a genuinely new keybind is added, so the list can
  // scroll it into view - new rows land at the end of profile.keybinds,
  // which with a long list otherwise means it's added below the fold with
  // no indication anything happened short of manually scrolling down to
  // check. Cleared once the scroll has been performed (see the effect near
  // the render below).
  const [lastAddedKeybindIndex, setLastAddedKeybindIndex] = useState<number | null>(null);

  // Mouse-click ability tracking ("region calibration") - advanced/
  // experimental, alongside keybinds rather than instead of them (see the
  // ClickZone doc comment in types.ts for the tradeoff: no UI-position
  // fragility for a keybind, but a click zone works for players who click
  // their ability bar instead of pressing a key for some/all abilities).
  //
  // true while "+ Add click zone" is active and the panel-1 ability list is
  // waiting for the NEXT ability click to start calibration, rather than
  // adding an ordinary keybind - see addKeybind below, which branches on
  // this the same way it already branches on replacingKeybindIndex.
  const [addingClickZoneMode, setAddingClickZoneMode] = useState(false);
  // Non-null while actually waiting on the calibration click itself (i.e.
  // window.tracker.captureClickZone()'s promise hasn't resolved yet) -
  // `zoneId: null` means "creating a brand new zone for this ability",
  // otherwise it's the id of an existing zone having its position re-picked.
  const [capturingZone, setCapturingZone] = useState<{ ability: string; zoneId: string | null } | null>(
    null
  );

  // Same idea as replacingKeybindIndex above, but for a click zone: swaps
  // which ability a zone points at while leaving its screen position and
  // radius untouched - tracked by id (not index) since that's how the rest
  // of the click-zone code already identifies a specific zone.
  const [replacingClickZoneId, setReplacingClickZoneId] = useState<string | null>(null);

  // Set right after a genuinely new click zone is added, so the list can
  // scroll it into view - same idea as lastAddedKeybindIndex below, mirrored
  // for click zones. Stores the zone's index within profile.clickZones (not
  // the filtered/visible list), matching the data-click-zone-index attribute
  // ClickZoneRow's row renders.
  const [lastAddedClickZoneIndex, setLastAddedClickZoneIndex] = useState<number | null>(null);

  function startAddClickZone() {
    setAddingClickZoneMode(true);
    setReplacingKeybindIndex(null);
    setReplacingClickZoneId(null);
  }

  function cancelAddClickZone() {
    setAddingClickZoneMode(false);
  }

  async function beginClickZoneCapture(ability: string, zoneId: string | null) {
    setAddingClickZoneMode(false);
    setCapturingZone({ ability, zoneId });
    const pos = await window.tracker.captureClickZone();
    setCapturingZone(null);
    if (!pos || !profile) return;
    if (zoneId) {
      applyProfileChange({
        ...profile,
        clickZones: (profile.clickZones ?? []).map((z) =>
          z.id === zoneId ? { ...z, x: pos.x, y: pos.y } : z
        )
      });
      return;
    }
    const newZone: ClickZone = {
      id: makeClickZoneId(),
      ability,
      x: pos.x,
      y: pos.y,
      // 26px, not the tighter 18px used previously - a real click on an
      // in-game ability icon rarely lands dead-center, especially at speed,
      // and RS3's default ability bar icons are roughly 32-36px square, so
      // this leaves enough margin for normal aim scatter without the zone
      // ballooning into a neighboring slot. Still adjustable per zone via
      // the ±px field (ClickZoneRow) if a specific one still gets missed.
      radius: 26,
      styleBarId: viewingShared ? null : profile.activeStyleBarId
    };
    const newZoneIndex = (profile.clickZones ?? []).length;
    applyProfileChange({ ...profile, clickZones: [...(profile.clickZones ?? []), newZone] });
    setLastAddedClickZoneIndex(newZoneIndex);
  }

  function cancelClickZoneCapture() {
    window.tracker.cancelCaptureClickZone();
    setCapturingZone(null);
  }

  function updateClickZone(id: string, patch: Partial<ClickZone>) {
    if (!profile) return;
    applyProfileChange({
      ...profile,
      clickZones: (profile.clickZones ?? []).map((z) => (z.id === id ? { ...z, ...patch } : z))
    });
  }

  function removeClickZone(id: string) {
    if (!profile) return;
    applyProfileChange({ ...profile, clickZones: (profile.clickZones ?? []).filter((z) => z.id !== id) });
  }

  // Same {item, index} shape as filteredKeybinds above, and for the same
  // reason: profile.clickZones is one flat array holding every bar's zones
  // interleaved, so reordering (moveClickZoneInView/reorderClickZoneTo
  // below) needs each visible row's ORIGINAL index to write the result back
  // into the right slot, not just its position in this filtered view.
  const filteredClickZones = useMemo(() => {
    if (!profile) return [];
    const withIndex = (profile.clickZones ?? []).map((zone, index) => ({ zone, index }));
    if (profile.styleBars.length === 0) return withIndex;
    return viewingShared
      ? withIndex.filter(({ zone }) => !zone.styleBarId)
      : withIndex.filter(({ zone }) => zone.styleBarId === profile.activeStyleBarId);
  }, [profile, viewingShared]);

  function addKeybind(ability: string) {
    if (!profile) return;
    if (addingClickZoneMode) {
      beginClickZoneCapture(ability, null);
      return;
    }
    if (replacingKeybindIndex !== null) {
      updateKeybind(replacingKeybindIndex, { ability });
      setReplacingKeybindIndex(null);
      return;
    }
    if (replacingClickZoneId !== null) {
      // Unlike the keybind case, this never re-runs the click capture - the
      // zone's screen position/radius are exactly what's being kept, only
      // the ability it's labeled/matched as changes.
      updateClickZone(replacingClickZoneId, { ability });
      setReplacingClickZoneId(null);
      return;
    }
    const nextKeybinds: Keybind[] = [
      ...profile.keybinds,
      // New keybinds default to whichever bar is currently selected - or
      // explicitly shared, if that's the tab being viewed, or if style bars
      // aren't in use at all - matching what you'd see and expect given
      // the tab you're looking at.
      {
        key: '',
        modifier: null,
        ability,
        styleBarId: viewingShared ? null : profile.activeStyleBarId
      }
    ];
    applyProfileChange({ ...profile, keybinds: nextKeybinds });
    setLastAddedKeybindIndex(nextKeybinds.length - 1);
  }

  function updateKeybind(index: number, patch: Partial<Keybind>) {
    if (!profile) return;
    const nextKeybinds = profile.keybinds.map((kb, i) => (i === index ? { ...kb, ...patch } : kb));
    applyProfileChange({ ...profile, keybinds: nextKeybinds });
  }

  function removeKeybind(index: number) {
    if (!profile) return;
    applyProfileChange({ ...profile, keybinds: profile.keybinds.filter((_, i) => i !== index) });
  }

  // Lets a keybind's ability be swapped out while keeping everything else
  // about it (key, modifier, shared/bar assignment) exactly as it was -
  // clicking a row's icon jumps focus over to the ability list with a
  // banner explaining what's happening; clicking an ability there fills it
  // in via addKeybind's replacingKeybindIndex branch above instead of
  // adding a new row.
  function requestChangeAbility(index: number) {
    setReplacingKeybindIndex(index);
    setReplacingClickZoneId(null);
    setAddingClickZoneMode(false);
    setKeybindSearch('');
  }

  function cancelChangeAbility() {
    setReplacingKeybindIndex(null);
  }

  // Click-zone equivalent of requestChangeAbility/cancelChangeAbility above -
  // clicking a click zone row's icon jumps focus to the ability list with a
  // banner, and the next ability clicked there fills in via addKeybind's
  // replacingClickZoneId branch instead of starting a new zone capture.
  function requestChangeClickZoneAbility(id: string) {
    setReplacingClickZoneId(id);
    setReplacingKeybindIndex(null);
    setAddingClickZoneMode(false);
  }

  function cancelChangeClickZoneAbility() {
    setReplacingClickZoneId(null);
  }

  // Reorder-for-organization within the CURRENTLY VISIBLE list (whichever
  // bar's tab, or Shared, or a keybind search is narrowing it down right
  // now) - order has no effect on how keybinds are matched at runtime
  // (electron/inputListener.js resolves by key + active style bar, never by
  // position). "Visible" matters here because profile.keybinds is one flat
  // array holding every bar's keybinds interleaved - swapping two ADJACENT
  // entries in that raw array could easily mean swapping a visible row with
  // an invisible one belonging to a different bar, which would silently do
  // nothing on screen. Operating on filteredKeybinds' own order instead (and
  // writing the result back into the same underlying array slots the
  // visible rows occupied) guarantees "move up/down" always swaps with
  // whichever row is visibly adjacent to it, exactly as it looks.
  function moveKeybindInView(originalIndex: number, direction: -1 | 1) {
    if (!profile) return;
    const order = filteredKeybinds.map((f) => f.index);
    const pos = order.indexOf(originalIndex);
    const swapWithPos = pos + direction;
    if (pos === -1 || swapWithPos < 0 || swapWithPos >= order.length) return;
    const newOrder = [...order];
    [newOrder[pos], newOrder[swapWithPos]] = [newOrder[swapWithPos], newOrder[pos]];
    const slots = [...order].sort((a, b) => a - b);
    const reorderedItems = newOrder.map((i) => profile.keybinds[i]);
    const nextKeybinds = [...profile.keybinds];
    slots.forEach((slot, i) => {
      nextKeybinds[slot] = reorderedItems[i];
    });
    applyProfileChange({ ...profile, keybinds: nextKeybinds });
  }

  // Drag-and-drop reordering, alongside the ▲/▼ buttons above - the buttons
  // are precise but slow for a long jump (moving something 20 spots means
  // 20 clicks), dragging covers that case in one motion. Tracked in a ref,
  // not state, since it doesn't need to trigger a re-render on its own -
  // only draggedOverIndex (for the drop-target highlight) does.
  const dragSourceIndexRef = useRef<number | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);

  function startKeybindDrag(originalIndex: number) {
    dragSourceIndexRef.current = originalIndex;
  }

  function endKeybindDrag() {
    dragSourceIndexRef.current = null;
    setDraggedOverIndex(null);
  }

  // Drops whatever's being dragged onto the row at targetOriginalIndex,
  // within the CURRENTLY VISIBLE order (see moveKeybindInView above for why
  // that matters). Uses each row's *pre-move* visible position for both the
  // removal and the insertion, which is what makes the result match what a
  // player would expect regardless of drag direction: dragging a row down
  // past others inserts it right after the row it's dropped on, dragging it
  // up inserts it right before - there's no "drag one way, then have to drag
  // it back the other way to land where intended" the way a naive same-index
  // swap could produce.
  function reorderKeybindTo(targetOriginalIndex: number) {
    if (!profile) return;
    const fromOriginalIndex = dragSourceIndexRef.current;
    endKeybindDrag();
    if (fromOriginalIndex === null || fromOriginalIndex === targetOriginalIndex) return;

    const order = filteredKeybinds.map((f) => f.index);
    const fromPos = order.indexOf(fromOriginalIndex);
    const toPos = order.indexOf(targetOriginalIndex);
    if (fromPos === -1 || toPos === -1) return;

    const newOrder = [...order];
    const [moved] = newOrder.splice(fromPos, 1);
    newOrder.splice(toPos, 0, moved);

    const slots = [...order].sort((a, b) => a - b);
    const reorderedItems = newOrder.map((i) => profile.keybinds[i]);
    const nextKeybinds = [...profile.keybinds];
    slots.forEach((slot, i) => {
      nextKeybinds[slot] = reorderedItems[i];
    });
    applyProfileChange({ ...profile, keybinds: nextKeybinds });
  }

  // Click-zone equivalents of moveKeybindInView/the drag-and-drop trio above
  // - same reasoning throughout (operate on filteredClickZones' visible
  // order, write back into profile.clickZones' original slots), just for
  // clickZones instead of keybinds. Order has no effect on how a click zone
  // is matched at runtime either (electron/inputListener.js resolves by
  // screen position, never by list position) - purely for keeping a long
  // list organized.
  function moveClickZoneInView(originalIndex: number, direction: -1 | 1) {
    if (!profile) return;
    const zones = profile.clickZones ?? [];
    const order = filteredClickZones.map((f) => f.index);
    const pos = order.indexOf(originalIndex);
    const swapWithPos = pos + direction;
    if (pos === -1 || swapWithPos < 0 || swapWithPos >= order.length) return;
    const newOrder = [...order];
    [newOrder[pos], newOrder[swapWithPos]] = [newOrder[swapWithPos], newOrder[pos]];
    const slots = [...order].sort((a, b) => a - b);
    const reorderedItems = newOrder.map((i) => zones[i]);
    const nextZones = [...zones];
    slots.forEach((slot, i) => {
      nextZones[slot] = reorderedItems[i];
    });
    applyProfileChange({ ...profile, clickZones: nextZones });
  }

  const dragSourceClickZoneIndexRef = useRef<number | null>(null);
  const [draggedOverClickZoneIndex, setDraggedOverClickZoneIndex] = useState<number | null>(null);

  function startClickZoneDrag(originalIndex: number) {
    dragSourceClickZoneIndexRef.current = originalIndex;
  }

  function endClickZoneDrag() {
    dragSourceClickZoneIndexRef.current = null;
    setDraggedOverClickZoneIndex(null);
  }

  function reorderClickZoneTo(targetOriginalIndex: number) {
    if (!profile) return;
    const zones = profile.clickZones ?? [];
    const fromOriginalIndex = dragSourceClickZoneIndexRef.current;
    endClickZoneDrag();
    if (fromOriginalIndex === null || fromOriginalIndex === targetOriginalIndex) return;

    const order = filteredClickZones.map((f) => f.index);
    const fromPos = order.indexOf(fromOriginalIndex);
    const toPos = order.indexOf(targetOriginalIndex);
    if (fromPos === -1 || toPos === -1) return;

    const newOrder = [...order];
    const [moved] = newOrder.splice(fromPos, 1);
    newOrder.splice(toPos, 0, moved);

    const slots = [...order].sort((a, b) => a - b);
    const reorderedItems = newOrder.map((i) => zones[i]);
    const nextZones = [...zones];
    slots.forEach((slot, i) => {
      nextZones[slot] = reorderedItems[i];
    });
    applyProfileChange({ ...profile, clickZones: nextZones });
  }

  // Scrolls a just-added keybind row into view - see lastAddedKeybindIndex
  // above. Runs after render (the DOM node only exists once React has
  // committed the new row), and is a no-op if the row isn't actually
  // present (e.g. a keybind search filter is hiding it) rather than
  // throwing.
  useEffect(() => {
    if (lastAddedKeybindIndex === null) return;
    const row = document.querySelector(`[data-keybind-index="${lastAddedKeybindIndex}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setLastAddedKeybindIndex(null);
  }, [lastAddedKeybindIndex]);

  // Click-zone equivalent of the above.
  useEffect(() => {
    if (lastAddedClickZoneIndex === null) return;
    const row = document.querySelector(`[data-click-zone-index="${lastAddedClickZoneIndex}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setLastAddedClickZoneIndex(null);
  }, [lastAddedClickZoneIndex]);

  async function save() {
    if (!profile) return;
    setSaveState('saving');
    await window.tracker.saveProfile(profile, activeProfileId);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1200);
  }

  // Export/import move a whole profile (keybinds, style bars, settings)
  // between machines, or act as a manual backup - useful since the profile
  // otherwise only lives in a per-OS app-data folder most players never
  // look in. Both go through a native file dialog in the main process
  // (electron/main.js); "canceled" just means the person closed that
  // dialog without picking anything, so it's shown as a neutral status
  // string, not treated as a failure.
  const [profileIoStatus, setProfileIoStatus] = useState<string | null>(null);

  async function exportProfile() {
    const result = await window.tracker.exportProfile();
    if (result.canceled) return;
    setProfileIoStatus(result.ok ? `Exported to ${result.path}` : 'Export failed.');
    setTimeout(() => setProfileIoStatus(null), 4000);
  }

  async function importProfile() {
    const result = await window.tracker.importProfile();
    if (result.canceled) return;
    if (result.ok && result.profile) {
      // The main process already saved and applied the imported profile to
      // the live input listener/overlay - just mirror it into this
      // window's own state so the UI (keybind list, style bars, search
      // filters) reflects it immediately instead of waiting for a reload.
      setProfile(result.profile);
      isFirstProfileLoad.current = true; // the incoming state isn't a local edit - skip the auto-save debounce for this one swap
      resetUndoHistory(); // undoing past an import would mean undoing into whatever was there before it
      setProfileIoStatus('Profile imported.');
    } else {
      setProfileIoStatus(`Import failed: ${result.error ?? 'unknown error'}`);
    }
    setTimeout(() => setProfileIoStatus(null), 4000);
  }

  // Switching between saved profiles reuses the same "this isn't a local
  // edit" trick as importProfile above - the incoming content came from
  // disk (or was just created there), so it shouldn't immediately trigger
  // the debounced auto-save right back onto itself.
  async function switchSavedProfile(id: string) {
    if (id === activeProfileId) return;
    const nextProfile = await window.tracker.switchSavedProfile(id);
    isFirstProfileLoad.current = true;
    resetUndoHistory(); // a different profile's edit history doesn't apply here
    setProfile(nextProfile);
    setActiveProfileId(id);
  }

  // Takes the name directly (from ProfileSwitcher's own inline input) rather
  // than calling window.prompt() here - Electron doesn't implement
  // window.prompt at all, so it used to just silently do nothing when
  // clicked, with no error and no dialog ever appearing.
  async function createSavedProfile(name: string) {
    const { id, profile: created } = await window.tracker.createSavedProfile(name);
    setSavedProfiles((prev) => [...prev, { id, name }]);
    isFirstProfileLoad.current = true;
    resetUndoHistory();
    setProfile(created);
    setActiveProfileId(id);
  }

  async function duplicateSavedProfile(name: string) {
    if (!activeProfileId) return;
    const { id, profile: duplicated } = await window.tracker.duplicateSavedProfile(
      activeProfileId,
      name
    );
    setSavedProfiles((prev) => [...prev, { id, name }]);
    isFirstProfileLoad.current = true;
    resetUndoHistory();
    setProfile(duplicated);
    setActiveProfileId(id);
  }

  async function renameSavedProfile(name: string) {
    if (!activeProfileId || !name.trim()) return;
    const trimmed = name.trim();
    await window.tracker.renameSavedProfile(activeProfileId, trimmed);
    setSavedProfiles((prev) =>
      prev.map((p) => (p.id === activeProfileId ? { ...p, name: trimmed } : p))
    );
  }

  async function deleteSavedProfile() {
    if (!activeProfileId || savedProfiles.length <= 1) return;
    const currentName = savedProfiles.find((p) => p.id === activeProfileId)?.name ?? 'this profile';
    if (!window.confirm(`Delete "${currentName}"? This can't be undone.`)) return;
    const switched = await window.tracker.deleteSavedProfile(activeProfileId);
    setSavedProfiles((prev) => prev.filter((p) => p.id !== activeProfileId));
    if (switched) {
      isFirstProfileLoad.current = true;
      setProfile(switched.profile);
      setActiveProfileId(switched.id);
    }
  }

  // Selecting a bar (a tab click, here) is the manual-override switching
  // method - separate from a weapon-trigger keybind or the cycle key, but
  // all three end up calling the same setActiveStyleBar on the backend, so
  // whichever one you use, the others (and the overlay/UI) stay in sync.
  // Called directly (not via the debounced profile auto-save) so switching
  // feels instant rather than waiting ~400ms.
  function selectStyleBar(barId: string) {
    if (!profile) return;
    setViewingShared(false);
    setProfile({ ...profile, activeStyleBarId: barId });
    window.tracker.setActiveStyleBar(barId);
  }

  function addStyleBar() {
    if (!profile) return;
    const bar: StyleBar = {
      id: makeStyleBarId(),
      name: `Style ${profile.styleBars.length + 1}`,
      weaponTrigger: null,
      enabled: true
    };
    const nextBars = [...profile.styleBars, bar];
    const nextActiveId = profile.activeStyleBarId ?? bar.id;
    applyProfileChange({ ...profile, styleBars: nextBars, activeStyleBarId: nextActiveId });
    if (!profile.activeStyleBarId) window.tracker.setActiveStyleBar(bar.id);
  }

  // Copies a bar - its name (with " copy" appended, same convention as
  // Duplicate Profile), weapon trigger, enabled state, and every keybind
  // that belongs to it specifically (shared keybinds aren't touched - they
  // already apply to every bar, including the new one, without copying).
  // Handy as a starting point for "same as Melee but a couple of keys
  // different" instead of rebuilding a whole bar from scratch.
  function duplicateStyleBar(id: string) {
    if (!profile) return;
    const source = profile.styleBars.find((b) => b.id === id);
    if (!source) return;
    const newBar: StyleBar = {
      ...source,
      id: makeStyleBarId(),
      name: `${source.name} copy`
    };
    const copiedKeybinds: Keybind[] = profile.keybinds
      .filter((kb) => kb.styleBarId === id)
      .map((kb) => ({ ...kb, styleBarId: newBar.id }));
    applyProfileChange({
      ...profile,
      styleBars: [...profile.styleBars, newBar],
      keybinds: [...profile.keybinds, ...copiedKeybinds]
    });
  }

  function renameStyleBar(id: string, name: string) {
    if (!profile) return;
    applyProfileChange({
      ...profile,
      styleBars: profile.styleBars.map((b) => (b.id === id ? { ...b, name } : b))
    });
  }

  function deleteStyleBar(id: string) {
    if (!profile) return;
    const nextBars = profile.styleBars.filter((b) => b.id !== id);
    // Keybinds that belonged only to the deleted bar become shared rather
    // than vanishing or pointing at a bar that no longer exists.
    const nextKeybinds = profile.keybinds.map((kb) =>
      kb.styleBarId === id ? { ...kb, styleBarId: null } : kb
    );
    const nextActiveId =
      profile.activeStyleBarId === id ? (nextBars[0]?.id ?? null) : profile.activeStyleBarId;
    applyProfileChange({
      ...profile,
      styleBars: nextBars,
      keybinds: nextKeybinds,
      activeStyleBarId: nextActiveId
    });
    if (profile.activeStyleBarId === id) window.tracker.setActiveStyleBar(nextActiveId);
  }

  function setBarWeaponTrigger(id: string, chord: KeyChord | null) {
    if (!profile) return;
    applyProfileChange({
      ...profile,
      styleBars: profile.styleBars.map((b) => (b.id === id ? { ...b, weaponTrigger: chord } : b))
    });
  }

  function setCycleBarKey(chord: KeyChord | null) {
    if (!profile) return;
    applyProfileChange({ ...profile, settings: { ...profile.settings, cycleBarKey: chord } });
  }

  // Excludes a bar from weapon-trigger/cycle-key switching without
  // touching its keybinds - see the toggle-key note in StyleBarPanel. Does
  // NOT deselect it if it's currently active; only the switching logic
  // (electron/inputListener.js) skips disabled bars.
  function toggleStyleBarEnabled(id: string, enabled: boolean) {
    if (!profile) return;
    applyProfileChange({
      ...profile,
      styleBars: profile.styleBars.map((b) => (b.id === id ? { ...b, enabled } : b))
    });
  }

  if (!profile) {
    return (
      <div className="app-loading">
        <p>Loading your profile…</p>
      </div>
    );
  }

  return (
    <div className="app">
      {updateResult?.updateAvailable && !bannerDismissed && (
        <UpdateBanner
          result={updateResult}
          onDismiss={() => setBannerDismissed(true)}
          onSkip={skipUpdateVersion}
        />
      )}

      <header className="app-header">
        <div>
          <h1>PvM Pulse</h1>
          <p className="subtitle">
            Map a keybind to an ability, see it appear on the overlay instantly - no screen
            calibration required. (Click zones, if you use them instead of a key, are the one
            exception - see the Click zones tab.)
          </p>
        </div>
        <div className="header-actions">
          {profileIoStatus && <span className="io-status">{profileIoStatus}</span>}
          <button
            type="button"
            className={`pause-button ${paused ? 'paused' : ''}`}
            onClick={togglePause}
            title={
              paused
                ? 'Tracking is paused - keypresses are ignored and nothing reaches the overlay. Click to resume.'
                : 'Pause tracking - e.g. before typing a password or a private message on stream, so nothing you type shows up on the overlay.'
            }
          >
            {paused ? '⏸ Paused - Click to Resume' : '⏸ Pause Tracking'}
          </button>
          <button
            className="secondary-button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo the last edit (Ctrl+Z)"
          >
            ↶ Undo
          </button>
          <button
            className="secondary-button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo the last undone edit (Ctrl+Shift+Z / Ctrl+Y)"
          >
            ↷ Redo
          </button>
          <button className="secondary-button" onClick={importProfile} title="Load keybinds, style bars, and settings from a file">
            Import Profile…
          </button>
          <button className="secondary-button" onClick={exportProfile} title="Save your whole setup to a file, e.g. to move to another PC">
            Export Profile…
          </button>
        </div>
      </header>

      <ProfileSwitcher
        profiles={savedProfiles}
        activeProfileId={activeProfileId}
        onSwitch={switchSavedProfile}
        onCreate={createSavedProfile}
        onDuplicate={duplicateSavedProfile}
        onRename={renameSavedProfile}
        onDelete={deleteSavedProfile}
        onSave={save}
        saveState={saveState}
      />

      <StyleBarPanel
        bars={profile.styleBars}
        activeBarId={profile.activeStyleBarId}
        viewingShared={viewingShared}
        onSelectBar={selectStyleBar}
        onSelectShared={() => setViewingShared(true)}
        onAddBar={addStyleBar}
        onRenameBar={renameStyleBar}
        onDuplicateBar={duplicateStyleBar}
        onDeleteBar={deleteStyleBar}
        onSetWeaponTrigger={setBarWeaponTrigger}
        onToggleBarEnabled={toggleStyleBarEnabled}
        cycleBarKey={profile.settings.cycleBarKey}
        onSetCycleBarKey={setCycleBarKey}
      />

      <div className="app-grid">
        <section className="panel">
          <h2>1. Find something to bind</h2>
          {abilitiesError && (
            <p className="error-banner">
              Couldn't load the ability list ({abilitiesError}). Try restarting the app - if this
              keeps happening, please report it as a bug.
            </p>
          )}
          {replacingKeybindIndex !== null && (
            <p className="replace-banner">
              Choose a replacement for{' '}
              <strong>{profile.keybinds[replacingKeybindIndex]?.ability}</strong> - its key stays
              bound.{' '}
              <button type="button" className="replace-banner-cancel" onClick={cancelChangeAbility}>
                Cancel
              </button>
            </p>
          )}
          {addingClickZoneMode && (
            <p className="replace-banner">
              Click the ability you want to bind to a screen position - you'll then click its slot
              in-game to calibrate it.{' '}
              <button type="button" className="replace-banner-cancel" onClick={cancelAddClickZone}>
                Cancel
              </button>
            </p>
          )}
          {replacingClickZoneId !== null && (
            <p className="replace-banner">
              Choose a replacement for{' '}
              <strong>{profile.clickZones?.find((z) => z.id === replacingClickZoneId)?.ability}</strong>{' '}
              - its screen position stays the same.{' '}
              <button
                type="button"
                className="replace-banner-cancel"
                onClick={cancelChangeClickZoneAbility}
              >
                Cancel
              </button>
            </p>
          )}
          {capturingZone && (
            <p className="replace-banner">
              Now click <strong>{capturingZone.ability}</strong>'s slot in-game to
              {capturingZone.zoneId ? ' re-record its position' : ' record its position'}.{' '}
              <button type="button" className="replace-banner-cancel" onClick={cancelClickZoneCapture}>
                Cancel
              </button>
            </p>
          )}
          <input
            className="search-input"
            placeholder="Search abilities, weapons, perks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="tag-filter-row">
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`tag-chip ${activeTags.has(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(tag)}
                type="button"
              >
                {tag}
              </button>
            ))}
          </div>
          <ul className="ability-list">
            {filteredAbilities.map((ability) => (
              <li key={ability.action}>
                <button
                  className="ability-pill"
                  onClick={() => addKeybind(ability.action)}
                  title={
                    addingClickZoneMode
                      ? `Bind ${ability.action} to a screen click`
                      : replacingKeybindIndex !== null
                        ? `Use ${ability.action} for this keybind instead`
                        : replacingClickZoneId !== null
                          ? `Use ${ability.action} for this click zone instead`
                          : undefined
                  }
                >
                  {iconUrl(ability.icon) ? (
                    <img className="ability-icon" src={iconUrl(ability.icon)!} alt="" />
                  ) : (
                    <span className="ability-icon ability-icon-blank" aria-hidden="true" />
                  )}
                  <span className="ability-tag">{ability.tag}</span>
                  {ability.action}
                  <span className="ability-add">
                    {addingClickZoneMode
                      ? '🖱'
                      : replacingKeybindIndex !== null || replacingClickZoneId !== null
                        ? '↺'
                        : '+'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>
            2. Bind it
            {profile.styleBars.length > 0 && (
              <span className="panel-subheading">
                {' '}
                — viewing{' '}
                {viewingShared
                  ? 'Shared abilities'
                  : (profile.styleBars.find((b) => b.id === profile.activeStyleBarId)?.name ?? 'this bar')}
              </span>
            )}
          </h2>

          <div className="binding-tabs">
            <button
              type="button"
              className={`binding-tab ${bindingTab === 'keys' ? 'active' : ''}`}
              onClick={() => setBindingTab('keys')}
            >
              Keybinds{profile.keybinds.length > 0 ? ` (${profile.keybinds.length})` : ''}
            </button>
            <button
              type="button"
              className={`binding-tab ${bindingTab === 'clicks' ? 'active' : ''}`}
              onClick={() => setBindingTab('clicks')}
            >
              Click zones{(profile.clickZones?.length ?? 0) > 0 ? ` (${profile.clickZones!.length})` : ''}{' '}
              <span className="advanced-tag">advanced</span>
            </button>
          </div>

          {bindingTab === 'keys' && (
            <>
              <p className="hint">
                Click "Press key…" then hit the key on your keyboard. That's it. Click a row's icon
                to swap its ability without losing the keybind, or use ▲▼ to reorder.
              </p>
              {profile.keybinds.length > 0 && (
                <input
                  className="search-input"
                  placeholder="Filter your bound keys…"
                  value={keybindSearch}
                  onChange={(e) => setKeybindSearch(e.target.value)}
                />
              )}
              <div className="keybind-list">
                {profile.keybinds.length === 0 && (
                  <p className="empty-state">No keybinds yet — add an ability on the left to start.</p>
                )}
                {profile.keybinds.length > 0 && filteredKeybinds.length === 0 && (
                  <p className="empty-state">
                    {keybindSearch
                      ? `No bound keys match "${keybindSearch}".`
                      : viewingShared
                        ? 'No shared keybinds yet - add an ability here, or switch to a style bar and tick "shared" on an existing keybind to move it over.'
                        : 'Nothing bound to this style bar yet - add an ability on the left to get started.'}
                  </p>
                )}
                {filteredKeybinds.map(({ kb, index }, viewPos) => (
                  <KeybindRow
                    key={`${kb.ability}-${index}`}
                    rowIndex={index}
                    keybind={kb}
                    icon={abilityIconByName[kb.ability] ?? null}
                    onChange={(patch) => updateKeybind(index, patch)}
                    onRemove={() => removeKeybind(index)}
                    onRequestChangeAbility={() => requestChangeAbility(index)}
                    showStyleControls={profile.styleBars.length > 0}
                    activeBarId={profile.activeStyleBarId}
                    onMoveUp={() => moveKeybindInView(index, -1)}
                    onMoveDown={() => moveKeybindInView(index, 1)}
                    canMoveUp={viewPos > 0}
                    canMoveDown={viewPos < filteredKeybinds.length - 1}
                    onDragStart={() => startKeybindDrag(index)}
                    onDragEnd={endKeybindDrag}
                    onDragEnter={() => setDraggedOverIndex(index)}
                    onDropOnto={() => reorderKeybindTo(index)}
                    draggedOver={draggedOverIndex === index}
                  />
                ))}
              </div>
            </>
          )}

          {bindingTab === 'clicks' && (
            <div className="click-zone-section">
              <p className="hint">
                For players who click abilities instead of pressing a key. Only works while your
                in-game ability bar stays in the same screen position - if you move it, resize it, or
                change UI scale, re-pick the zone's location below. Click a row's icon to swap its
                ability without losing its position, or use ▲▼ to reorder.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={startAddClickZone}
                disabled={addingClickZoneMode || capturingZone !== null}
              >
                + Add click zone
              </button>
              <div className="click-zone-list">
                {filteredClickZones.length === 0 && (
                  <p className="empty-state">
                    {viewingShared
                      ? 'No shared click zones yet - add an ability here, or switch to a style bar and untick "shared" on an existing zone to move it over.'
                      : 'No click zones yet - click "+ Add click zone" above to bind an ability to a screen position.'}
                  </p>
                )}
                {filteredClickZones.map(({ zone, index }, viewPos) => (
                  <ClickZoneRow
                    key={zone.id}
                    zone={zone}
                    rowIndex={index}
                    icon={abilityIconByName[zone.ability] ?? null}
                    onChangeRadius={(radius) => updateClickZone(zone.id, { radius })}
                    onRepick={() => beginClickZoneCapture(zone.ability, zone.id)}
                    onRemove={() => removeClickZone(zone.id)}
                    onRequestChangeAbility={() => requestChangeClickZoneAbility(zone.id)}
                    repicking={capturingZone?.zoneId === zone.id}
                    showStyleControls={profile.styleBars.length > 0}
                    activeBarId={profile.activeStyleBarId}
                    onToggleShared={(shared) =>
                      updateClickZone(zone.id, { styleBarId: shared ? null : profile.activeStyleBarId })
                    }
                    onMoveUp={() => moveClickZoneInView(index, -1)}
                    onMoveDown={() => moveClickZoneInView(index, 1)}
                    canMoveUp={viewPos > 0}
                    canMoveDown={viewPos < filteredClickZones.length - 1}
                    onDragStart={() => startClickZoneDrag(index)}
                    onDragEnd={endClickZoneDrag}
                    onDragEnter={() => setDraggedOverClickZoneIndex(index)}
                    onDropOnto={() => reorderClickZoneTo(index)}
                    draggedOver={draggedOverClickZoneIndex === index}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>3. Overlay</h2>
          <OverlayLinkPanel overlayUrl={overlayUrl} />
          <LivePreview casts={recentCasts} iconCount={profile.settings.iconCount} />
          <label className="icon-count-control">
            Icons shown on overlay (4–{MAX_ICON_COUNT})
            <input
              type="number"
              min={4}
              max={MAX_ICON_COUNT}
              value={profile.settings.iconCount}
              onChange={(e) => {
                const clamped = Math.min(MAX_ICON_COUNT, Math.max(4, Number(e.target.value) || 4));
                applyProfileChange({
                  ...profile,
                  settings: { ...profile.settings, iconCount: clamped }
                });
              }}
            />
          </label>
        </section>
      </div>

      <footer className="app-footer">
        <span>PvM Pulse {appVersion ? `v${appVersion}` : ''}</span>
        <button type="button" className="link-button" onClick={checkForUpdates} disabled={checkingForUpdate}>
          {checkingForUpdate ? 'Checking…' : 'Check for updates'}
        </button>
      </footer>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AbilityInfo,
  CastEvent,
  KeyChord,
  Keybind,
  Profile,
  SavedProfileSummary,
  StyleBar
} from './types';
import KeybindRow from './components/KeybindRow';
import LivePreview from './components/LivePreview';
import OverlayLinkPanel from './components/OverlayLinkPanel';
import ProfileSwitcher from './components/ProfileSwitcher';
import StyleBarPanel from './components/StyleBarPanel';
import { iconUrl } from './iconUrl';

function makeStyleBarId() {
  return `bar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
    return () => {
      unsubscribeCasts();
      unsubscribeStyleBar();
    };
  }, []);

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

  function addKeybind(ability: string) {
    if (!profile) return;
    if (replacingKeybindIndex !== null) {
      updateKeybind(replacingKeybindIndex, { ability });
      setReplacingKeybindIndex(null);
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
    setKeybindSearch('');
  }

  function cancelChangeAbility() {
    setReplacingKeybindIndex(null);
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
      <header className="app-header">
        <div>
          <h1>PvM Pulse</h1>
          <p className="subtitle">
            Map a keybind to an ability, see it appear on the overlay instantly. No screen
            calibration required.
          </p>
        </div>
        <div className="header-actions">
          {profileIoStatus && <span className="io-status">{profileIoStatus}</span>}
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
        onDeleteBar={deleteStyleBar}
        onSetWeaponTrigger={setBarWeaponTrigger}
        onToggleBarEnabled={toggleStyleBarEnabled}
        cycleBarKey={profile.settings.cycleBarKey}
        onSetCycleBarKey={setCycleBarKey}
      />

      <div className="app-grid">
        <section className="panel">
          <h2>1. Find an ability</h2>
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
                  title={replacingKeybindIndex !== null ? `Use ${ability.action} for this keybind instead` : undefined}
                >
                  {iconUrl(ability.icon) ? (
                    <img className="ability-icon" src={iconUrl(ability.icon)!} alt="" />
                  ) : (
                    <span className="ability-icon ability-icon-blank" aria-hidden="true" />
                  )}
                  <span className="ability-tag">{ability.tag}</span>
                  {ability.action}
                  <span className="ability-add">{replacingKeybindIndex !== null ? '↺' : '+'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>
            2. Bind a key to it
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
          <p className="hint">
            Click "Press key…" then hit the key on your keyboard. That's it. Click a row's icon to
            swap its ability without losing the keybind, or use ▲▼ to reorder.
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
    </div>
  );
}

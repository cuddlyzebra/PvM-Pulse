import { useEffect, useMemo, useRef, useState } from 'react';
import type { AbilityInfo, CastEvent, KeyChord, Keybind, Profile, StyleBar } from './types';
import KeybindRow from './components/KeybindRow';
import LivePreview from './components/LivePreview';
import OverlayLinkPanel from './components/OverlayLinkPanel';
import StyleBarPanel from './components/StyleBarPanel';
import { iconUrl } from './iconUrl';

function makeStyleBarId() {
  return `bar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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

  useEffect(() => {
    window.tracker.getProfile().then(setProfile);
    window.tracker.getOverlayUrl().then(setOverlayUrl);
    window.tracker.listAbilities().then(setAbilities).catch((err) => {
      console.error('Failed to load ability list:', err);
      setAbilitiesError(err?.message ?? String(err));
    });
    const unsubscribeCasts = window.tracker.onCastEvent((event) => {
      setRecentCasts((prev) => [event, ...prev].slice(0, 8));
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
    const timeout = setTimeout(async () => {
      await window.tracker.saveProfile(profile);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 900);
    }, 400);
    return () => clearTimeout(timeout);
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

  const filteredKeybinds = useMemo(() => {
    if (!profile) return [];
    const withIndex = profile.keybinds.map((kb, index) => ({ kb, index }));
    // Once style bars exist, only show keybinds relevant to whichever bar
    // is currently active: that bar's own keybinds, plus every "shared"
    // one (no styleBarId) - a keybind belonging to a *different*, inactive
    // bar is hidden here rather than cluttering the list (it still exists,
    // it's just not what you're looking at right now).
    const barFiltered =
      profile.styleBars.length > 0
        ? withIndex.filter(({ kb }) => !kb.styleBarId || kb.styleBarId === profile.activeStyleBarId)
        : withIndex;
    const q = keybindSearch.trim().toLowerCase();
    if (!q) return barFiltered;
    return barFiltered.filter(
      ({ kb }) => kb.ability.toLowerCase().includes(q) || kb.key.toLowerCase().includes(q)
    );
  }, [profile, keybindSearch]);

  function addKeybind(ability: string) {
    if (!profile) return;
    const nextKeybinds: Keybind[] = [
      ...profile.keybinds,
      // New keybinds default to whichever bar is currently selected (or
      // shared/no bar, if style bars aren't in use) - matches what you'd
      // see and expect given the tab you're looking at.
      { key: '', modifier: null, ability, styleBarId: profile.activeStyleBarId }
    ];
    setProfile({ ...profile, keybinds: nextKeybinds });
  }

  function updateKeybind(index: number, patch: Partial<Keybind>) {
    if (!profile) return;
    const nextKeybinds = profile.keybinds.map((kb, i) => (i === index ? { ...kb, ...patch } : kb));
    setProfile({ ...profile, keybinds: nextKeybinds });
  }

  function removeKeybind(index: number) {
    if (!profile) return;
    setProfile({ ...profile, keybinds: profile.keybinds.filter((_, i) => i !== index) });
  }

  async function save() {
    if (!profile) return;
    setSaveState('saving');
    await window.tracker.saveProfile(profile);
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
      setProfileIoStatus('Profile imported.');
    } else {
      setProfileIoStatus(`Import failed: ${result.error ?? 'unknown error'}`);
    }
    setTimeout(() => setProfileIoStatus(null), 4000);
  }

  // Selecting a bar (a tab click, here) is the manual-override switching
  // method - separate from a weapon-trigger keybind or the cycle key, but
  // all three end up calling the same setActiveStyleBar on the backend, so
  // whichever one you use, the others (and the overlay/UI) stay in sync.
  // Called directly (not via the debounced profile auto-save) so switching
  // feels instant rather than waiting ~400ms.
  function selectStyleBar(barId: string) {
    if (!profile) return;
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
    setProfile({ ...profile, styleBars: nextBars, activeStyleBarId: nextActiveId });
    if (!profile.activeStyleBarId) window.tracker.setActiveStyleBar(bar.id);
  }

  function renameStyleBar(id: string, name: string) {
    if (!profile) return;
    setProfile({
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
    setProfile({
      ...profile,
      styleBars: nextBars,
      keybinds: nextKeybinds,
      activeStyleBarId: nextActiveId
    });
    if (profile.activeStyleBarId === id) window.tracker.setActiveStyleBar(nextActiveId);
  }

  function setBarWeaponTrigger(id: string, chord: KeyChord | null) {
    if (!profile) return;
    setProfile({
      ...profile,
      styleBars: profile.styleBars.map((b) => (b.id === id ? { ...b, weaponTrigger: chord } : b))
    });
  }

  function setCycleBarKey(chord: KeyChord | null) {
    if (!profile) return;
    setProfile({ ...profile, settings: { ...profile.settings, cycleBarKey: chord } });
  }

  // Excludes a bar from weapon-trigger/cycle-key switching without
  // touching its keybinds - see the toggle-key note in StyleBarPanel. Does
  // NOT deselect it if it's currently active; only the switching logic
  // (electron/inputListener.js) skips disabled bars.
  function toggleStyleBarEnabled(id: string, enabled: boolean) {
    if (!profile) return;
    setProfile({
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
          <button className="secondary-button" onClick={importProfile} title="Load keybinds, style bars, and settings from a file">
            Import Profile…
          </button>
          <button className="secondary-button" onClick={exportProfile} title="Save your whole setup to a file, e.g. to move to another PC">
            Export Profile…
          </button>
          <button className="save-button" onClick={save} disabled={saveState === 'saving'}>
            {saveState === 'saved' ? 'Saved ✓' : saveState === 'saving' ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </header>

      <StyleBarPanel
        bars={profile.styleBars}
        activeBarId={profile.activeStyleBarId}
        onSelectBar={selectStyleBar}
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
                <button className="ability-pill" onClick={() => addKeybind(ability.action)}>
                  {iconUrl(ability.icon) ? (
                    <img className="ability-icon" src={iconUrl(ability.icon)!} alt="" />
                  ) : (
                    <span className="ability-icon ability-icon-blank" aria-hidden="true" />
                  )}
                  <span className="ability-tag">{ability.tag}</span>
                  {ability.action}
                  <span className="ability-add">+</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>2. Bind a key to it</h2>
          <p className="hint">Click "Press key…" then hit the key on your keyboard. That's it.</p>
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
                  : 'Nothing bound to this style bar yet - add an ability, or mark an existing keybind "shared".'}
              </p>
            )}
            {filteredKeybinds.map(({ kb, index }) => (
              <KeybindRow
                key={`${kb.ability}-${index}`}
                keybind={kb}
                icon={abilityIconByName[kb.ability] ?? null}
                onChange={(patch) => updateKeybind(index, patch)}
                onRemove={() => removeKeybind(index)}
                showStyleControls={profile.styleBars.length > 0}
                activeBarId={profile.activeStyleBarId}
              />
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>3. Overlay</h2>
          <OverlayLinkPanel overlayUrl={overlayUrl} />
          <LivePreview casts={recentCasts} iconCount={profile.settings.iconCount} />
          <label className="icon-count-control">
            Icons shown on overlay (4–14)
            <input
              type="number"
              min={4}
              max={14}
              value={profile.settings.iconCount}
              onChange={(e) => {
                const clamped = Math.min(14, Math.max(4, Number(e.target.value) || 4));
                setProfile({
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

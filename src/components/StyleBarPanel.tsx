import { useState } from 'react';
import type { KeyChord, StyleBar } from '../types';
import KeyCaptureButton from './KeyCaptureButton';

interface Props {
  bars: StyleBar[];
  activeBarId: string | null;
  viewingShared: boolean;
  onSelectBar: (id: string) => void;
  onSelectShared: () => void;
  onAddBar: () => void;
  onRenameBar: (id: string, name: string) => void;
  onDuplicateBar: (id: string) => void;
  onDeleteBar: (id: string) => void;
  onSetWeaponTrigger: (id: string, chord: KeyChord | null) => void;
  onToggleBarEnabled: (id: string, enabled: boolean) => void;
  cycleBarKey: KeyChord | null;
  onSetCycleBarKey: (chord: KeyChord | null) => void;
}

/**
 * Multiple ability bars (melee/ranged/magic, say), switchable three ways:
 * clicking a tab here, a weapon-trigger keybind fired in-game (set per bar
 * below - the same key you already press to swap gear), or the cycle key
 * at the bottom. All three end up calling the same switch underneath, so
 * whichever one you use, the others stay in sync.
 *
 * If you don't use multiple styles, none of this needs to exist - with no
 * bars added, keybinds work exactly like a single flat list always did.
 *
 * The on/off checkbox per bar handles a specific case: RS3's built-in
 * weapon swap is often a single key toggling between exactly two loadouts,
 * and which two styles that represents changes fight to fight (melee+magic
 * one boss, melee+ranged the next). Give two or three bars the SAME
 * weapon-trigger key and turn off whichever one isn't in play this session
 * - the shared key then toggles only between the bars still switched on.
 * A greyed-out bar keeps its keybinds and can still be picked manually;
 * it's just left out of automatic switching until turned back on.
 *
 * The "Shared" pill (once any bar exists) is a fourth, always-present tab
 * that isn't a real style bar - it can't be switched to at runtime, deleted,
 * given a weapon trigger, or turned off, since shared keybinds are already
 * live no matter which real bar is active. It exists purely so the keybind
 * list (App.tsx) can show just the shared keybinds on their own instead of
 * always mixed in with whichever bar's specific ones - otherwise there's no
 * way to look at (or add to) just the universal set once a profile has a
 * lot of both.
 */
export default function StyleBarPanel({
  bars,
  activeBarId,
  viewingShared,
  onSelectBar,
  onSelectShared,
  onAddBar,
  onRenameBar,
  onDuplicateBar,
  onDeleteBar,
  onSetWeaponTrigger,
  onToggleBarEnabled,
  cycleBarKey,
  onSetCycleBarKey
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);

  return (
    <div className="style-bar-panel">
      <div className="style-bar-tabs">
        {bars.length > 0 && (
          <button
            type="button"
            className={`style-bar-tab shared-tab ${viewingShared ? 'active' : ''}`}
            onClick={onSelectShared}
            title="View and add keybinds that apply no matter which style is active"
          >
            Shared abilities
          </button>
        )}
        {bars.map((bar) => {
          const enabled = bar.enabled !== false;
          return (
          <div
            key={bar.id}
            className={`style-bar-tab ${
              !viewingShared && bar.id === activeBarId ? 'active' : ''
            } ${enabled ? '' : 'disabled'}`}
          >
            <input
              type="checkbox"
              className="style-bar-enabled-toggle"
              checked={enabled}
              onChange={(e) => onToggleBarEnabled(bar.id, e.target.checked)}
              title={enabled ? 'On - included in weapon-trigger/cycle switching' : 'Off - skipped by weapon-trigger/cycle switching'}
            />
            {renamingId === bar.id ? (
              <input
                className="style-bar-rename-input"
                autoFocus
                defaultValue={bar.name}
                onBlur={(e) => {
                  onRenameBar(bar.id, e.target.value.trim() || bar.name);
                  setRenamingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <button
                type="button"
                className="style-bar-tab-name"
                onClick={() => onSelectBar(bar.id)}
                onDoubleClick={() => setRenamingId(bar.id)}
                title="Click to switch to this bar, double-click to rename"
              >
                {bar.name}
              </button>
            )}
            <KeyCaptureButton
              value={bar.weaponTrigger}
              onChange={(chord) => onSetWeaponTrigger(bar.id, chord)}
              placeholder="blank"
            />
            <button
              type="button"
              className="duplicate-bar-button"
              aria-label={`Duplicate ${bar.name}`}
              title={`Duplicate "${bar.name}" and its keybinds as a new bar`}
              onClick={() => onDuplicateBar(bar.id)}
            >
              ⧉
            </button>
            {/* Deliberately set apart from KeyCaptureButton's own small "×"
                (which just clears the weapon-trigger key) - a divider, extra
                spacing, a bigger trash icon, and a confirmation prompt below
                all exist so this can't be mistaken for that one and clicked
                by accident. Deleting is still undoable via Ctrl+Z right
                after, but the prompt is worth having anyway since "all this
                bar's keybinds, gone" isn't obvious from a bare × the way
                clearing one key is. */}
            <span className="style-bar-tab-divider" aria-hidden="true" />
            <button
              type="button"
              className="remove-bar-button"
              aria-label={`Delete ${bar.name}`}
              title={`Delete "${bar.name}" and all its keybinds`}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${bar.name}" and all its keybinds? (Ctrl+Z undoes this if you change your mind right after.)`
                  )
                ) {
                  onDeleteBar(bar.id);
                }
              }}
            >
              🗑
            </button>
          </div>
          );
        })}
        <button type="button" className="style-bar-add" onClick={onAddBar}>
          + Add style bar
        </button>
      </div>
      {bars.length > 1 && (
        <div className="cycle-bar-control">
          <span>Cycle bars key (optional):</span>
          <KeyCaptureButton value={cycleBarKey} onChange={onSetCycleBarKey} placeholder="none set" />
        </div>
      )}
    </div>
  );
}

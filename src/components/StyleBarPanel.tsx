import { useState } from 'react';
import type { KeyChord, StyleBar } from '../types';
import KeyCaptureButton from './KeyCaptureButton';

interface Props {
  bars: StyleBar[];
  activeBarId: string | null;
  onSelectBar: (id: string) => void;
  onAddBar: () => void;
  onRenameBar: (id: string, name: string) => void;
  onDeleteBar: (id: string) => void;
  onSetWeaponTrigger: (id: string, chord: KeyChord | null) => void;
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
 */
export default function StyleBarPanel({
  bars,
  activeBarId,
  onSelectBar,
  onAddBar,
  onRenameBar,
  onDeleteBar,
  onSetWeaponTrigger,
  cycleBarKey,
  onSetCycleBarKey
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);

  return (
    <div className="style-bar-panel">
      <div className="style-bar-tabs">
        {bars.map((bar) => (
          <div key={bar.id} className={`style-bar-tab ${bar.id === activeBarId ? 'active' : ''}`}>
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
              placeholder="weapon key…"
            />
            <button
              type="button"
              className="remove-button"
              aria-label={`Delete ${bar.name}`}
              onClick={() => onDeleteBar(bar.id)}
            >
              ×
            </button>
          </div>
        ))}
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

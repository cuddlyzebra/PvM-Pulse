import { useState } from 'react';
import type { Keybind } from '../types';
import { iconUrl } from '../iconUrl';

interface Props {
  keybind: Keybind;
  icon: string | null;
  onChange: (patch: Partial<Keybind>) => void;
  onRemove: () => void;
  // Only relevant once at least one style bar exists - see App.tsx. When
  // true, shows a checkbox for whether this keybind is "shared" (active no
  // matter which style bar is live) or specific to whichever bar is
  // currently being edited (activeBarId).
  showStyleControls?: boolean;
  activeBarId?: string | null;
}

const MODIFIERS: Array<Keybind['modifier']> = [null, 'shift', 'ctrl', 'alt'];

/**
 * Replaces the original wizard's "type the keycode as text" field
 * (e.g. typing "f1", "del") with an actual "press the key" capture —
 * the browser KeyboardEvent gives us a real key name directly, no manual
 * keycode lookup table for the user to get wrong.
 */
export default function KeybindRow({
  keybind,
  icon,
  onChange,
  onRemove,
  showStyleControls,
  activeBarId
}: Props) {
  const [capturing, setCapturing] = useState(false);
  const resolvedIconUrl = iconUrl(icon);

  function startCapture() {
    setCapturing(true);
    function handler(e: KeyboardEvent) {
      e.preventDefault();
      // The global key listener (electron/inputListener.js) matches against
      // uiohook-napi's own key names, not the browser's - almost all of
      // them agree once lowercased (letters, digits, F-keys, arrow keys),
      // but the spacebar doesn't: the browser reports it as a literal " "
      // character, while uiohook calls it "Space". Without this, binding
      // spacebar would capture fine and look bound, but the key would never
      // actually match anything when pressed for real.
      const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
      if (['shift', 'control', 'alt', 'meta'].includes(key)) return;
      onChange({ key });
      setCapturing(false);
      window.removeEventListener('keydown', handler, true);
    }
    window.addEventListener('keydown', handler, true);
  }

  return (
    <div className="keybind-row">
      {resolvedIconUrl ? (
        <img className="keybind-icon" src={resolvedIconUrl} alt="" title={keybind.ability} />
      ) : (
        <span className="keybind-icon keybind-icon-blank" aria-hidden="true" />
      )}
      <span className="keybind-ability-name">{keybind.ability}</span>

      <select
        value={keybind.modifier ?? ''}
        onChange={(e) => onChange({ modifier: (e.target.value || null) as Keybind['modifier'] })}
      >
        {MODIFIERS.map((mod) => (
          <option key={mod ?? 'none'} value={mod ?? ''}>
            {mod ?? 'no modifier'}
          </option>
        ))}
      </select>

      <button className={`key-capture-button ${capturing ? 'capturing' : ''}`} onClick={startCapture}>
        {capturing ? 'Press a key…' : keybind.key ? keybind.key : 'Press key…'}
      </button>

      {showStyleControls && (
        <label className="shared-toggle" title="Active no matter which style bar is live">
          <input
            type="checkbox"
            checked={!keybind.styleBarId}
            onChange={(e) => onChange({ styleBarId: e.target.checked ? null : (activeBarId ?? null) })}
          />
          shared
        </label>
      )}

      <button className="remove-button" onClick={onRemove} aria-label={`Remove ${keybind.ability}`}>
        ×
      </button>
    </div>
  );
}

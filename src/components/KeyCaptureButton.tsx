import { useState } from 'react';
import type { KeyChord } from '../types';
import { formatKeyLabel, normalizeCapturedKey } from '../keyNormalize';

interface Props {
  value: KeyChord | null;
  onChange: (chord: KeyChord | null) => void;
  placeholder?: string;
}

/**
 * A standalone "press a key (optionally with a modifier held)" capture,
 * used for style-bar weapon triggers and the cycle-bar key. Different from
 * the capture built into KeybindRow: that one captures the key alone and
 * pairs it with a separate modifier dropdown (fine for abilities, which
 * are usually bound with a consistent modifier scheme). A weapon-swap key
 * is more naturally just "press the actual combo you use in-game", so this
 * reads the modifier directly off the same keydown event.
 */
export default function KeyCaptureButton({ value, onChange, placeholder }: Props) {
  const [capturing, setCapturing] = useState(false);

  function startCapture() {
    setCapturing(true);
    function handler(e: KeyboardEvent) {
      e.preventDefault();
      // See the matching note in KeybindRow.tsx - stops this capture from
      // also being read by the global undo/redo shortcut.
      e.stopPropagation();
      const rawKey = e.key;
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(rawKey)) return;
      // Same normalization as KeybindRow's capture - see keyNormalize.ts.
      const key = normalizeCapturedKey(rawKey);
      const modifier: KeyChord['modifier'] = e.shiftKey
        ? 'shift'
        : e.ctrlKey
          ? 'ctrl'
          : e.altKey
            ? 'alt'
            : null;
      onChange({ key, modifier });
      setCapturing(false);
      window.removeEventListener('keydown', handler, true);
    }
    window.addEventListener('keydown', handler, true);
  }

  const label = capturing
    ? 'Press a key…'
    : value
      ? `${value.modifier ? value.modifier + '+' : ''}${formatKeyLabel(value.key)}`
      : (placeholder ?? 'Press key…');

  return (
    <span className="key-capture-with-clear">
      <button
        type="button"
        className={`key-capture-button ${capturing ? 'capturing' : ''}`}
        onClick={startCapture}
      >
        {label}
      </button>
      {value && (
        <button
          type="button"
          className="remove-button"
          aria-label="Clear key"
          onClick={() => onChange(null)}
        >
          ×
        </button>
      )}
    </span>
  );
}

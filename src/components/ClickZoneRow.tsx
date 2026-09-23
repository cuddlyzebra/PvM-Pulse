import type { ClickZone } from '../types';
import { iconUrl } from '../iconUrl';

interface Props {
  zone: ClickZone;
  // profile.clickZones' index for this row - used to tag the row's DOM node
  // (data-click-zone-index) so App.tsx can scroll a just-added zone into
  // view, and as the identity reorder operations move/drop onto. Same
  // pattern as KeybindRow's rowIndex.
  rowIndex: number;
  icon: string | null;
  onChangeRadius: (radius: number) => void;
  onRepick: () => void;
  onRemove: () => void;
  // Requests swapping this zone's ability without touching its screen
  // position/radius/shared setting - see requestChangeClickZoneAbility in
  // App.tsx. Same idea as KeybindRow's onRequestChangeAbility.
  onRequestChangeAbility: () => void;
  repicking: boolean;
  showStyleControls?: boolean;
  activeBarId?: string | null;
  onToggleShared: (shared: boolean) => void;
  // Move-up/move-down and drag-and-drop reordering - identical contract to
  // KeybindRow's equivalents, just operating on profile.clickZones instead
  // of profile.keybinds (see moveClickZoneInView/reorderClickZoneTo in
  // App.tsx). Order has no effect on how a click is matched at runtime
  // (electron/inputListener.js resolves by screen position, not list
  // position) - purely for keeping a long list organized.
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDropOnto: () => void;
  draggedOver: boolean;
}

/**
 * One row in the "Click zones (advanced)" list - mirrors KeybindRow's
 * layout/conventions (drag handle, ▲▼ reorder, icon button to swap ability,
 * shared checkbox, remove button) but for a mouse-click binding instead of
 * a keyboard one. No key-capture button; instead there's "Re-pick
 * location", which re-runs the same calibration capture used to create the
 * zone (see App.tsx's recaptureClickZone) - the thing this feature is most
 * likely to need again later, since it only keeps working while the
 * in-game ability bar stays in the same screen position (see the ClickZone
 * doc comment in types.ts).
 */
export default function ClickZoneRow({
  zone,
  rowIndex,
  icon,
  onChangeRadius,
  onRepick,
  onRemove,
  onRequestChangeAbility,
  repicking,
  showStyleControls,
  activeBarId,
  onToggleShared,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDropOnto,
  draggedOver
}: Props) {
  const resolvedIconUrl = iconUrl(icon);

  return (
    <div
      className={`keybind-row click-zone-row ${draggedOver ? 'drag-over' : ''}`}
      data-click-zone-index={rowIndex}
      onDragOver={(e) => {
        // Chromium only treats an element as a valid drop target once
        // dragover has preventDefault() called on it - without this, drop
        // never fires at all (same Electron/Chromium quirk KeybindRow's
        // drag handle works around).
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragEnter();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnto();
      }}
    >
      <span
        className="keybind-drag-handle"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(rowIndex));
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        title="Drag to move this row a long way - or use ▲▼ for one step at a time"
        aria-hidden="true"
      >
        ⠿
      </span>
      <div className="keybind-reorder">
        <button
          type="button"
          className="keybind-reorder-button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label="Move up"
          title="Move up"
        >
          ▲
        </button>
        <button
          type="button"
          className="keybind-reorder-button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label="Move down"
          title="Move down"
        >
          ▼
        </button>
      </div>
      <button
        type="button"
        className="keybind-icon-button"
        onClick={onRequestChangeAbility}
        title="Change this zone's ability - keeps the same screen position"
      >
        {resolvedIconUrl ? (
          <img className="keybind-icon" src={resolvedIconUrl} alt="" />
        ) : (
          <span className="keybind-icon keybind-icon-blank" aria-hidden="true" />
        )}
      </button>
      <span className="keybind-ability-name">{zone.ability}</span>

      <label className="click-zone-radius" title="How close (in pixels) a click has to land to count">
        ±
        <input
          type="number"
          min={4}
          max={200}
          value={zone.radius}
          onChange={(e) => onChangeRadius(Math.max(4, Math.min(200, Number(e.target.value) || 18)))}
        />
        px
      </label>

      <button
        type="button"
        className={`key-capture-button ${repicking ? 'capturing' : ''}`}
        onClick={onRepick}
        title="Click here, then click the ability's slot in-game to re-record its position"
      >
        {repicking ? 'Click the slot in-game…' : `Re-pick location (${zone.x}, ${zone.y})`}
      </button>

      {showStyleControls && (
        <label
          className="shared-toggle"
          title="Active no matter which style bar is live - moves this row to the Shared tab"
        >
          <input
            type="checkbox"
            checked={!zone.styleBarId}
            onChange={(e) => onToggleShared(e.target.checked)}
          />
          shared
        </label>
      )}

      <button className="remove-button" onClick={onRemove} aria-label={`Remove ${zone.ability} click zone`}>
        ×
      </button>
    </div>
  );
}

import { useRef, useState } from 'react';
import type { SavedProfileSummary } from '../types';

interface Props {
  profiles: SavedProfileSummary[];
  activeProfileId: string | null;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onDuplicate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSave: () => void;
  saveState: 'idle' | 'saving' | 'saved';
}

/**
 * Lets a player keep several named profiles - one per character, one per
 * boss loadout, whatever - and switch between them without leaving the
 * app, separate from the file-based Export/Import buttons in the header
 * (those move a profile to/from a file; this switches between profiles
 * already saved locally). Renaming, and now creating/duplicating, reuse the
 * same inline-input pattern as StyleBarPanel's bar renaming, for the same
 * reason: no separate modal just to type a name.
 *
 * Create/Duplicate used to call window.prompt() up in App.tsx - Electron's
 * renderer doesn't implement window.prompt at all, so those buttons just
 * silently did nothing when clicked (no dialog, no error). This inline
 * input is the fix, not just a style choice.
 */
export default function ProfileSwitcher({
  profiles,
  activeProfileId,
  onSwitch,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
  onSave,
  saveState
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [pendingAction, setPendingAction] = useState<'create' | 'duplicate' | null>(null);
  const cancelledRef = useRef(false);
  const activeName = profiles.find((p) => p.id === activeProfileId)?.name ?? '';

  function confirmPending(value: string) {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setPendingAction(null);
      return;
    }
    const name = value.trim();
    if (name) {
      if (pendingAction === 'create') onCreate(name);
      else if (pendingAction === 'duplicate') onDuplicate(name);
    }
    setPendingAction(null);
  }

  return (
    <div className="profile-switcher">
      <span className="profile-switcher-label">Profile:</span>
      {renaming ? (
        <input
          className="style-bar-rename-input"
          autoFocus
          defaultValue={activeName}
          onBlur={(e) => {
            onRename(e.target.value.trim() || activeName);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <select
          className="profile-select"
          value={activeProfileId ?? ''}
          onChange={(e) => onSwitch(e.target.value)}
          title="Switch to a different saved profile"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="secondary-button"
        onClick={() => setRenaming(true)}
        title="Rename this profile"
      >
        Rename
      </button>

      {pendingAction ? (
        <input
          className="style-bar-rename-input"
          autoFocus
          placeholder={pendingAction === 'create' ? 'New profile name…' : 'Duplicate name…'}
          defaultValue={pendingAction === 'duplicate' ? `${activeName} copy` : 'New Profile'}
          onBlur={(e) => confirmPending(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              cancelledRef.current = true;
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPendingAction('create')}
            title="Create a new, empty profile"
          >
            + New
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPendingAction('duplicate')}
            title="Duplicate this profile under a new name"
          >
            Duplicate
          </button>
        </>
      )}

      <button
        type="button"
        className="save-button"
        onClick={onSave}
        disabled={saveState === 'saving'}
      >
        {saveState === 'saved' ? 'Saved ✓' : saveState === 'saving' ? 'Saving…' : 'Save Profile'}
      </button>

      <button
        type="button"
        className="secondary-button danger-button"
        onClick={onDelete}
        disabled={profiles.length <= 1}
        title={profiles.length <= 1 ? "Can't delete the only profile" : 'Delete this profile'}
      >
        Delete
      </button>
    </div>
  );
}

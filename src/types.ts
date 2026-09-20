export interface AbilityInfo {
  action: string;
  tag: string;
  // Filename under data/icons/ (e.g. "rend.webp"). Sourced together with
  // `action` from RotationMaster, so this should always be present.
  icon: string;
}

export interface KeyChord {
  key: string;
  modifier: 'shift' | 'ctrl' | 'alt' | null;
}

export interface Keybind extends KeyChord {
  ability: string;
  // Which style bar this belongs to, or null if it's "shared" - active no
  // matter which style bar is currently live (defensives, movement, prayer
  // flicks, anything that doesn't change between melee/ranged/magic).
  // Existing profiles from before style bars existed have no styleBarId on
  // any keybind at all, which is equivalent to null - so old profiles keep
  // working exactly as before (everything shared, no bars) with no
  // migration step needed.
  styleBarId?: string | null;
}

export interface StyleBar {
  id: string;
  name: string;
  // The in-game keybind you press to swap to this weapon/style. Pressing it
  // silently switches which bar's keybinds are "live" - it never itself
  // shows up on the overlay (see electron/inputListener.js).
  weaponTrigger: KeyChord | null;
}

export interface ProfileSettings {
  iconCount: number;
  alwaysOnTop: boolean;
  theme: 'dark' | 'light';
  // Optional keybind that advances to the next style bar, wrapping around -
  // a manual fallback alongside weapon-trigger auto-switching and picking a
  // bar directly in the setup window.
  cycleBarKey: KeyChord | null;
}

export interface Profile {
  settings: ProfileSettings;
  keybinds: Keybind[];
  styleBars: StyleBar[];
  // Which style bar is "live" right now. Persisted so restarting the app
  // mid-session doesn't reset you back to the first bar.
  activeStyleBarId: string | null;
}

export interface CastEvent {
  action: string;
  tag: string;
  // Filename under data/icons/ (e.g. "rend.webp"), or null in the rare case
  // this ability has no matching icon.
  icon: string | null;
  timestamp: number;
}

// The preload script exposes this on window; declared here so the
// renderer gets type-checking without pulling Electron types into the
// browser bundle.
declare global {
  interface Window {
    tracker: {
      getProfile: () => Promise<Profile>;
      saveProfile: (profile: Profile) => Promise<{ ok: boolean }>;
      getOverlayUrl: () => Promise<string>;
      listAbilities: () => Promise<AbilityInfo[]>;
      pause: () => Promise<void>;
      resume: () => Promise<void>;
      onCastEvent: (cb: (event: CastEvent) => void) => () => void;
      setActiveStyleBar: (barId: string | null) => Promise<void>;
      onStyleBarChanged: (cb: (barId: string | null) => void) => () => void;
    };
  }
}

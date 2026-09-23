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

// A mouse-click binding, tied to a screen position rather than a key -
// "advanced"/experimental, unlike keybinds, because it depends on your
// in-game ability bar staying in the same screen position: move it,
// resize it, or change your UI scale afterward, and every zone bound near
// it needs re-picking. See electron/inputListener.js's _resolveClickZone
// for exactly how a click is matched to one of these.
export interface ClickZone {
  id: string;
  ability: string;
  // Absolute screen coordinates (not window-relative - the game is a
  // separate window from this app, often a separate monitor), captured by
  // clicking the ability bar slot once during setup.
  x: number;
  y: number;
  // How close (in pixels) a real click has to land to (x, y) to count as
  // this zone - a small tolerance rather than requiring a pixel-perfect
  // click, since ability icons have some real size on screen.
  radius: number;
  // Same meaning as Keybind.styleBarId - null/absent means "shared",
  // active no matter which style bar is live.
  styleBarId?: string | null;
}

export interface StyleBar {
  id: string;
  name: string;
  // The in-game keybind you press to swap to this weapon/style. Pressing it
  // silently switches which bar's keybinds are "live" - it never itself
  // shows up on the overlay (see electron/inputListener.js).
  weaponTrigger: KeyChord | null;
  // Whether this bar takes part in weapon-trigger/cycle-key switching right
  // now. Lets a player keep a bar's keybinds configured but temporarily
  // exclude it - e.g. some in-game weapon-swap keybinds are a single
  // physical key that toggles between exactly two loadouts (RS3's built-in
  // gear-swap), and which two styles that represents changes fight to
  // fight. Disabling the style you're not using that session, while
  // leaving the other two sharing the same weaponTrigger key, turns that
  // one key into a toggle between just those two. Missing/undefined means
  // enabled, so profiles saved before this existed keep working unchanged.
  // A disabled bar can still be selected manually and edited - disabling
  // only removes it from automatic switching.
  enabled?: boolean;
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
  // Mouse-click bindings - see ClickZone above. Missing/undefined on a
  // profile saved before this existed is equivalent to an empty list, same
  // pattern as Keybind.styleBarId - no migration step needed.
  clickZones?: ClickZone[];
}

// A saved profile's entry in the switcher list - just enough to render it
// and pick it, not its actual keybind content (see SavedProfileCreated
// below for what switching/creating actually returns).
export interface SavedProfileSummary {
  id: string;
  name: string;
}

export interface SavedProfileCreated {
  id: string;
  profile: Profile;
}

export interface CastEvent {
  action: string;
  tag: string;
  // Filename under data/icons/ (e.g. "rend.webp"), or null in the rare case
  // this ability has no matching icon.
  icon: string | null;
  timestamp: number;
}

// What electron/updateChecker.js's checkForUpdate() resolves with - see
// there for exactly how `updateAvailable` is decided. `ok: false` means the
// check itself failed (offline, GitHub unreachable, no releases published
// yet) rather than "no update available", so the UI can stay silent about
// it either way.
export interface UpdateCheckResult {
  ok: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  tagName?: string;
  releaseUrl?: string;
  downloadUrl?: string | null;
  notes?: string;
  error?: string;
  skippedVersion?: string | null;
  fromCache?: boolean;
}

// The preload script exposes this on window; declared here so the
// renderer gets type-checking without pulling Electron types into the
// browser bundle.
declare global {
  interface Window {
    tracker: {
      getProfile: () => Promise<Profile>;
      saveProfile: (
        profile: Profile,
        profileId: string | null
      ) => Promise<{ ok: boolean; stale?: boolean }>;
      getOverlayUrl: () => Promise<string>;
      listAbilities: () => Promise<AbilityInfo[]>;
      pause: () => Promise<void>;
      resume: () => Promise<void>;
      onCastEvent: (cb: (event: CastEvent) => void) => () => void;
      setActiveStyleBar: (barId: string | null) => Promise<void>;
      onStyleBarChanged: (cb: (barId: string | null) => void) => () => void;
      // Waits for the next real mouse click anywhere on screen (even
      // outside this app's own window - the game is a separate window)
      // and resolves with where it landed, for recording a click zone's
      // position. That click is consumed - it does NOT also trigger a
      // cast, even if it happens to land inside an existing zone.
      // Resolves to null if cancelCaptureClickZone() is called first, or
      // if a new capture is started before this one lands a click.
      captureClickZone: () => Promise<{ x: number; y: number } | null>;
      cancelCaptureClickZone: () => Promise<void>;
      // Both show a native file dialog and report what happened - canceled
      // is a normal outcome (the user backed out of the picker), not an
      // error, so callers should treat it separately from `error`.
      exportProfile: () => Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
      importProfile: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        error?: string;
        profile?: Profile;
      }>;
      // Multiple named saved profiles, switchable from inside the app -
      // distinct from exportProfile/importProfile above, which move a
      // profile to/from a file rather than switching between ones already
      // saved locally.
      listSavedProfiles: () => Promise<{
        activeProfileId: string;
        profiles: SavedProfileSummary[];
      }>;
      switchSavedProfile: (id: string) => Promise<Profile>;
      createSavedProfile: (name: string) => Promise<SavedProfileCreated>;
      duplicateSavedProfile: (id: string, name: string) => Promise<SavedProfileCreated>;
      renameSavedProfile: (id: string, name: string) => Promise<{ ok: boolean }>;
      // null means the deleted profile wasn't the active one, so nothing
      // else needs to change; otherwise this is the profile that's now
      // active instead (deleting the active profile always switches to
      // another - there's always at least one saved profile).
      deleteSavedProfile: (id: string) => Promise<SavedProfileCreated | null>;
    };
    updates: {
      check: (options?: { force?: boolean }) => Promise<UpdateCheckResult>;
      skipVersion: (version: string) => Promise<void>;
      openUrl: (url: string) => Promise<void>;
      onUpdateAvailable: (cb: (result: UpdateCheckResult) => void) => () => void;
    };
  }
}

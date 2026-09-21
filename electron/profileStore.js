const fs = require('fs/promises');
const path = require('path');
const { app } = require('electron');

// Default profile shipped with the app so a brand-new install has something
// sensible to show in the setup UI and overlay immediately, instead of a
// blank slate. Users edit this through the React setup UI, not by hand.
//
// styleBars/activeStyleBarId support multiple ability bars (melee/ranged/
// magic, say) that can be switched between - manually, by a cycle keybind,
// or automatically when a weapon-swap keybind is pressed (see
// electron/inputListener.js). Defaulting styleBars to [] means an existing
// profile from before this existed, or someone who just doesn't use
// multiple styles, keeps behaving exactly like a single flat keybind list -
// every keybind has no styleBarId (or an old profile has none at all),
// which is treated as "shared", i.e. always active.
const DEFAULT_PROFILE = {
  settings: {
    iconCount: 8,
    alwaysOnTop: true,
    theme: 'dark',
    cycleBarKey: null
  },
  keybinds: [],
  styleBars: [],
  activeStyleBarId: null
};

function getProfilePath() {
  // app.getPath('userData') is per-OS (Roaming/AppData, ~/Library/Application Support,
  // ~/.config), which is what makes this cross-platform vs. the original's
  // hardcoded "data\\input_profile.json" relative path.
  return path.join(app.getPath('userData'), 'profile.json');
}

// A shallow {...DEFAULT_PROFILE, ...loaded} would let an old saved
// profile's `settings` object (saved before cycleBarKey existed) silently
// wipe out that default by replacing the whole object - merge settings one
// level deep so new setting fields always have a value. Shared between
// loadProfile (the on-disk profile) and importing a profile someone
// exported from another machine, possibly on an older version of the app.
function normalizeProfile(loaded) {
  return {
    ...DEFAULT_PROFILE,
    ...loaded,
    settings: { ...DEFAULT_PROFILE.settings, ...(loaded.settings || {}) }
  };
}

async function loadProfile() {
  const profilePath = getProfilePath();
  try {
    const raw = await fs.readFile(profilePath, 'utf-8');
    return normalizeProfile(JSON.parse(raw));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Could not read profile.json, falling back to default:', err.message);
    }
    await saveProfile(DEFAULT_PROFILE);
    return DEFAULT_PROFILE;
  }
}

async function saveProfile(profile) {
  const profilePath = getProfilePath();
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
}

module.exports = { loadProfile, saveProfile, normalizeProfile, DEFAULT_PROFILE };

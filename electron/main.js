const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const { startOverlayServer } = require('./overlayServer');
const { InputListener } = require('./inputListener');
const {
  loadActiveProfile,
  saveActiveProfile,
  normalizeProfile,
  listProfiles,
  switchActiveProfile,
  createProfile,
  duplicateProfile,
  renameProfile,
  deleteProfile
} = require('./profileStore');
const { listAbilities } = require('./abilityData');

let mainWindow;
let tray;
let overlay;
let inputListener;
// Distinguishes "the user chose Quit (or the tray's Quit item, or the OS is
// shutting the app down)" from "the user clicked the window's close button"
// - only the latter should show the minimize-or-quit prompt below. Set from
// 'before-quit', which always fires before any window's 'close' event, so
// by the time that prompt would show, this already reflects whether it's a
// real quit.
let isQuitting = false;

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// Only one copy should ever be running at once: two would mean two global
// keyboard hooks double-firing every cast, and two overlay servers fighting
// over the same port. If another copy is already running, hand off to it
// (bring its window forward) and quit this one immediately rather than
// letting both run.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 760,
    minHeight: 560,
    title: 'PvM Pulse',
    backgroundColor: '#0d1117',
    // Packaged Windows builds get their icon from build/icon.ico (see
    // package.json's build.win.icon) automatically - this is for the
    // taskbar/title bar icon when running unpackaged via `npm run dev`,
    // plus it's what Linux uses either way.
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // The overlay and keybind tracking are meant to keep running in the
  // background for OBS even when the setup window itself isn't open (that's
  // the whole point of the tray icon) - so the window's own close button
  // shouldn't silently end the session. Ask what the person actually wants
  // instead of guessing.
  mainWindow.on('close', (event) => {
    if (isQuitting) return; // a real quit is already in progress - let it close normally
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Minimize to tray', 'Quit PvM Pulse', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Close PvM Pulse',
      message: 'Keep running in the background, or quit completely?',
      detail:
        'Minimizing to tray keeps tracking your keybinds and serving the OBS overlay. ' +
        'Quitting stops both - the overlay will go blank until you reopen the app.'
    });
    if (choice === 0) {
      mainWindow.hide();
    } else if (choice === 1) {
      isQuitting = true;
      app.quit();
    }
    // choice === 2 (Cancel, or the dialog dismissed another way): do
    // nothing - the window stays open exactly as it was.
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Tray icon is optional in dev; guard against a missing asset so the app
  // still runs from source without a packaged icon.
  try {
    tray = new Tray(path.join(__dirname, '..', 'data', 'icons', 'tray.png'));
    tray.setToolTip('PvM Pulse');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show',
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
          }
        },
        { label: 'Quit', click: () => app.quit() }
      ])
    );
    // Left-click (the common case on Windows) does the same as "Show" -
    // most tray apps don't make you open a menu just to bring the window
    // back.
    tray.on('click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch (err) {
    console.warn('Tray icon not available, skipping tray setup:', err.message);
  }
}

async function bootstrap() {
  // activeProfileId identifies which *saved* profile (see
  // electron/profileStore.js) is currently loaded - separate from `profile`
  // itself, which is that profile's actual keybind/style-bar content.
  // Switching, creating, duplicating, or deleting a saved profile below
  // always keeps both of these in sync with each other and with the
  // running InputListener/overlay.
  let { id: activeProfileId, profile } = await loadActiveProfile();

  overlay = startOverlayServer({ port: 5859 });
  overlay.broadcastProfileMeta(profile.settings);

  inputListener = new InputListener(profile);
  inputListener.on('cast', (event) => {
    overlay.broadcastCast(event);
    mainWindow?.webContents.send('cast-event', event);
  });
  // Fires on a manual pick in the UI, the cycle keybind, or a weapon-trigger
  // keybind being pressed in-game - whichever caused it, persist it (so
  // relaunching mid-session doesn't reset to a different bar) and let the
  // setup window update its "active style" indicator.
  inputListener.on('style-bar-changed', (barId) => {
    profile.activeStyleBarId = barId;
    saveActiveProfile(activeProfileId, profile).catch((err) =>
      console.warn('Could not persist active style bar:', err.message)
    );
    mainWindow?.webContents.send('style-bar-changed', barId);
  });
  inputListener.start();

  ipcMain.handle('profile:get', () => profile);
  ipcMain.handle('profile:save', async (_event, nextProfile) => {
    await saveActiveProfile(activeProfileId, nextProfile);
    // Keep the outer `profile` reference in sync too - style-bar-changed
    // events mutate `profile.activeStyleBarId` directly (see above), which
    // would otherwise be mutating a stale object once the renderer has
    // saved a newer one.
    profile = nextProfile;
    inputListener.updateProfile(nextProfile);
    overlay.broadcastProfileMeta(nextProfile.settings);
    return { ok: true };
  });
  // Export/import: lets a player move a profile to another machine, or
  // just keep a backup, without digging through AppData/Library/.config by
  // hand. Exports whatever's currently live in the app (including unsaved
  // edits, since the auto-save debounce means "live" and "on disk" are
  // rarely more than a few hundred ms apart anyway) rather than re-reading
  // from disk. Import replaces the content of whichever saved profile is
  // currently active (same slot, same id) - to bring in someone else's
  // export as a new, separate saved profile instead of overwriting the
  // active one, create a new profile first, then import into that.
  ipcMain.handle('profile:export', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export PvM Pulse profile',
      defaultPath: 'pvm-pulse-profile.json',
      filters: [{ name: 'PvM Pulse profile', extensions: ['json'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    await fs.writeFile(filePath, JSON.stringify(profile, null, 2), 'utf-8');
    return { ok: true, path: filePath };
  });
  ipcMain.handle('profile:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import PvM Pulse profile',
      properties: ['openFile'],
      filters: [{ name: 'PvM Pulse profile', extensions: ['json'] }]
    });
    if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
    let imported;
    try {
      const raw = await fs.readFile(filePaths[0], 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.keybinds)) {
        // Catches "picked the wrong file entirely" (not a profile at all)
        // early with a clear message, rather than the app silently ending
        // up with a keybind list of undefined further down the line.
        throw new Error('That file does not look like a PvM Pulse profile (no keybinds array).');
      }
      // Same merge as loading a profile from disk - an export made on an
      // older version of the app is missing newer fields entirely (style
      // bars, cycleBarKey, etc.), not just empty ones, so this fills them
      // in with defaults instead of the importing profile ending up with
      // undefined settings.
      imported = normalizeProfile(parsed);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    await saveActiveProfile(activeProfileId, imported);
    profile = imported;
    inputListener.updateProfile(imported);
    overlay.broadcastProfileMeta(imported.settings);
    return { ok: true, profile: imported };
  });
  // In-app saved-profile management (separate from the file-based
  // export/import above): lets a player keep several named profiles - one
  // per character, one per boss loadout, whatever - and switch between
  // them from inside the app itself. Every handler here keeps
  // activeProfileId, `profile`, the live InputListener, and the overlay's
  // broadcast metadata all in sync with each other, the same as
  // profile:save above.
  ipcMain.handle('profiles:list', () => listProfiles());
  ipcMain.handle('profiles:switch', async (_event, id) => {
    if (id === activeProfileId) return profile; // already active - no-op
    profile = await switchActiveProfile(id);
    activeProfileId = id;
    inputListener.updateProfile(profile);
    overlay.broadcastProfileMeta(profile.settings);
    return profile;
  });
  ipcMain.handle('profiles:create', async (_event, name) => {
    const created = await createProfile(name);
    activeProfileId = created.id;
    profile = created.profile;
    inputListener.updateProfile(profile);
    overlay.broadcastProfileMeta(profile.settings);
    return created;
  });
  ipcMain.handle('profiles:duplicate', async (_event, { id, name }) => {
    const created = await duplicateProfile(id, name);
    activeProfileId = created.id;
    profile = created.profile;
    inputListener.updateProfile(profile);
    overlay.broadcastProfileMeta(profile.settings);
    return created;
  });
  ipcMain.handle('profiles:rename', async (_event, { id, name }) => {
    await renameProfile(id, name);
    return { ok: true };
  });
  ipcMain.handle('profiles:delete', async (_event, id) => {
    // Only non-null if the deleted profile was the active one, in which
    // case deleteProfile already picked another to switch to (it refuses
    // to delete the last remaining profile in the first place, so there's
    // always one left to fall back to).
    const switched = await deleteProfile(id);
    if (switched) {
      activeProfileId = switched.id;
      profile = switched.profile;
      inputListener.updateProfile(profile);
      overlay.broadcastProfileMeta(profile.settings);
    }
    return switched;
  });
  ipcMain.handle('overlay:get-url', () => overlay.overlayUrl);
  // Read fresh (not just from the renderer's own build) so dyed items
  // fetched after the app was last built/packaged still show up on next
  // launch - see electron/abilityData.js for why this is split from the
  // base data file.
  ipcMain.handle('abilities:list', () => {
    try {
      return listAbilities();
    } catch (err) {
      // Log with the full stack in the main process's own console/log file
      // (visible via --enable-logging or the packaged app's log, unlike a
      // renderer console that most users never open) before letting the
      // rejection continue to the renderer, so a failure here is never
      // silent on either side.
      console.error('abilities:list failed:', err);
      throw err;
    }
  });
  ipcMain.handle('tracker:pause', () => inputListener.setPaused(true));
  ipcMain.handle('tracker:resume', () => inputListener.setPaused(false));
  // Manual style-bar switch from the setup window - same code path as a
  // weapon-trigger key or the cycle key, so it persists and notifies the UI
  // the same way.
  ipcMain.handle('style-bar:set-active', (_event, barId) => {
    inputListener.setActiveStyleBar(barId);
  });

  createMainWindow();
  createTray();
}

// Guarded by the single-instance lock acquired above - a losing second
// instance already called app.quit() and never reaches this point with a
// real bootstrap.
if (gotSingleInstanceLock) {
  app.whenReady().then(bootstrap);
}

app.on('window-all-closed', () => {
  // Keep the overlay server + input listener alive even if the setup
  // window is closed, since OBS may still be reading the overlay.
  if (process.platform !== 'darwin') {
    // no-op: app stays alive via tray
  }
});

app.on('before-quit', () => {
  // Always fires before any window's 'close' event during a real quit
  // (tray "Quit", choosing "Quit PvM Pulse" in the close prompt, Cmd+Q,
  // OS shutdown/logout, etc.) - set first so the close-prompt handler above
  // never re-asks during an already-confirmed quit.
  isQuitting = true;
  inputListener?.stop();
  overlay?.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

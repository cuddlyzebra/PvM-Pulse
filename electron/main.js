const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const { startOverlayServer } = require('./overlayServer');
const { InputListener } = require('./inputListener');
const { checkForUpdate, skipVersion } = require('./updateChecker');
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
    if (!mainWindow) return;
    // Fires in THIS (the original, already-running) process whenever
    // someone tries to launch another copy - that second copy just quits
    // itself immediately (see gotSingleInstanceLock above), so this is the
    // only place a message can actually be shown about it.
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Open PvM Pulse', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: 'PvM Pulse is already running',
        message: 'PvM Pulse is already running.',
        detail: 'Only one copy can run at a time - it keeps tracking your keybinds in the background even when minimized to the tray. Open the existing window?'
      })
      .then(({ response }) => {
        if (response !== 0) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      });
  });
}

function createMainWindow() {
  // 980x700 (the old default) was tight enough that the three-panel layout
  // (see src/styles.css's .app-grid, max-width 1200px) routinely needed the
  // window itself to scroll just to see everything, on top of the ability
  // and keybind lists' own intentional internal scrollbars. Sized relative
  // to the screen instead of a fixed guess, so it opens comfortably full on
  // a normal monitor without being clipped on a smaller one.
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1280, screenWidth - 80);
  const height = Math.min(900, screenHeight - 80);

  mainWindow = new BrowserWindow({
    width,
    height,
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

// Manual "Check for Updates" (tray menu, and the renderer's own button) -
// shown via a plain dialog rather than the in-app banner, since this can be
// triggered from the tray menu even while the setup window is hidden. force
// is always true here: someone clicking "Check for Updates" on purpose
// should always hit the network, not silently reuse a cached result from
// hours ago, and should see a result even if they'd previously skipped that
// version.
async function checkForUpdateAndNotify() {
  const result = await checkForUpdate({ force: true });
  if (!result.ok) {
    dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info',
      title: 'Check for Updates',
      message: "Couldn't check for updates right now.",
      detail: result.error || 'No further details available.'
    });
    return;
  }
  if (!result.updateAvailable) {
    dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info',
      title: 'Check for Updates',
      message: `You're up to date (v${result.currentVersion}).`
    });
    return;
  }
  const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'info',
    title: 'Update available',
    buttons: ['View release', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    message: `PvM Pulse v${result.latestVersion} is available (you're on v${result.currentVersion}).`,
    detail: 'This never installs automatically - opening the release page just lets you grab it yourself, the same way you got this version.'
  });
  if (response === 0 && result.releaseUrl) {
    shell.openExternal(result.downloadUrl || result.releaseUrl);
  }
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
        { label: 'Check for Updates…', click: () => checkForUpdateAndNotify() },
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

// Every handler below reads and mutates the SAME `profile`/`activeProfileId`
// variables (in bootstrap()) after at least one `await` (disk I/O). Without
// this, two calls arriving close together - e.g. the renderer's 400ms
// debounced auto-save landing while a profile switch/create/duplicate is
// still mid-flight - can interleave: one call's `await` yields the event
// loop, the other call runs to completion and changes activeProfileId, then
// the first call resumes and finishes its own write using now-stale
// assumptions. That's how one profile's content ends up saved into a
// DIFFERENT profile's file (surfaced as "I switched profiles and came back
// and everything was gone" - the reported bug this fixes). Queuing every
// profile-mutating handler through this so only one is ever in flight at a
// time closes off that whole class of interleaving, not just one instance
// of it.
let profileOpQueue = Promise.resolve();
function serializeProfileOp(fn) {
  const result = profileOpQueue.then(fn, fn); // run after the previous op settles, even if it rejected
  profileOpQueue = result.then(
    () => undefined,
    () => undefined
  ); // never let a rejection break the chain for the next queued op
  return result;
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
  ipcMain.handle('profile:save', (_event, nextProfile, forProfileId) =>
    serializeProfileOp(async () => {
      // forProfileId is which profile the RENDERER believed was active when
      // this save was queued (App.tsx's debounced auto-save passes its own
      // activeProfileId along). Even with the queue above preventing
      // mid-flight interleaving, a save can still have been *scheduled*
      // against an old profile shortly before the person switched away from
      // it - the queue only stops the two calls from stomping on each
      // other's half-finished work, it doesn't know this save is now
      // outdated. Compare against whichever profile is active by the time
      // this actually runs, and skip rather than guess if they've diverged.
      if (forProfileId && forProfileId !== activeProfileId) {
        console.warn(
          `profile:save ignored - was queued for profile ${forProfileId}, but ${activeProfileId} is active now`
        );
        return { ok: false, stale: true };
      }
      await saveActiveProfile(activeProfileId, nextProfile);
      // Keep the outer `profile` reference in sync too - style-bar-changed
      // events mutate `profile.activeStyleBarId` directly (see above), which
      // would otherwise be mutating a stale object once the renderer has
      // saved a newer one.
      profile = nextProfile;
      inputListener.updateProfile(nextProfile);
      overlay.broadcastProfileMeta(nextProfile.settings);
      return { ok: true };
    })
  );
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
  ipcMain.handle('profile:import', () =>
    serializeProfileOp(async () => {
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
    })
  );
  // In-app saved-profile management (separate from the file-based
  // export/import above): lets a player keep several named profiles - one
  // per character, one per boss loadout, whatever - and switch between
  // them from inside the app itself. Every handler here keeps
  // activeProfileId, `profile`, the live InputListener, and the overlay's
  // broadcast metadata all in sync with each other, the same as
  // profile:save above.
  ipcMain.handle('profiles:list', () => listProfiles());
  ipcMain.handle('profiles:switch', (_event, id) =>
    serializeProfileOp(async () => {
      if (id === activeProfileId) return profile; // already active - no-op
      profile = await switchActiveProfile(id);
      activeProfileId = id;
      inputListener.updateProfile(profile);
      overlay.broadcastProfileMeta(profile.settings);
      return profile;
    })
  );
  ipcMain.handle('profiles:create', (_event, name) =>
    serializeProfileOp(async () => {
      const created = await createProfile(name);
      activeProfileId = created.id;
      profile = created.profile;
      inputListener.updateProfile(profile);
      overlay.broadcastProfileMeta(profile.settings);
      return created;
    })
  );
  ipcMain.handle('profiles:duplicate', (_event, { id, name }) =>
    serializeProfileOp(async () => {
      const created = await duplicateProfile(id, name);
      activeProfileId = created.id;
      profile = created.profile;
      inputListener.updateProfile(profile);
      overlay.broadcastProfileMeta(profile.settings);
      return created;
    })
  );
  ipcMain.handle('profiles:rename', (_event, { id, name }) =>
    serializeProfileOp(async () => {
      await renameProfile(id, name);
      return { ok: true };
    })
  );
  ipcMain.handle('profiles:delete', (_event, id) =>
    serializeProfileOp(async () => {
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
    })
  );
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
  // Click-zone calibration - see InputListener.captureNextClick(). The
  // setup window awaits this while showing a "click the ability now"
  // banner; it resolves with the click's screen position, or null if
  // cancelCaptureClickZone() below fires first (banner dismissed).
  ipcMain.handle('clickzone:capture', () => inputListener.captureNextClick());
  ipcMain.handle('clickzone:cancel-capture', () => inputListener.cancelCaptureClickZone());

  // Update checking - see electron/updateChecker.js for how this decides
  // whether a newer version exists. `force` lets the renderer's own
  // "Check for updates" button bypass the "already checked recently"
  // throttle; the silent startup check below never forces, so normal
  // launches don't hit the GitHub API more than the throttle allows.
  ipcMain.handle('updates:check', (_event, options) => checkForUpdate(options || {}));
  ipcMain.handle('updates:skip', (_event, version) => skipVersion(version));
  ipcMain.handle('updates:open', (_event, url) => {
    if (url) shell.openExternal(url);
  });

  createMainWindow();
  createTray();

  // Checked once per launch, a few seconds after startup rather than
  // immediately - so it never competes with the window/overlay/input
  // listener for startup time, and so a person who force-quits within the
  // first couple seconds (rare, but this shouldn't be in the way of it)
  // never even triggers a network request. Silent: only pokes the renderer
  // if there's actually something new to show, and never if that version
  // was already dismissed via "skip this version".
  setTimeout(async () => {
    try {
      const result = await checkForUpdate({ force: false });
      if (result.ok && result.updateAvailable && result.latestVersion !== result.skippedVersion) {
        mainWindow?.webContents.send('update:available', result);
      }
    } catch (err) {
      console.warn('Startup update check failed:', err.message);
    }
  }, 4000);
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
  // Windows doesn't reliably clean up a tray icon just because the process
  // that created it exited - without an explicit destroy() here, the icon
  // can linger in the taskbar as a "ghost" until the user happens to mouse
  // over that part of the tray, which is what this was reported as
  // ("lingers after quitting"). Destroying it here removes it immediately,
  // the moment a real quit is confirmed.
  tray?.destroy();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

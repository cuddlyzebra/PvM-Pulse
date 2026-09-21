const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

const { startOverlayServer } = require('./overlayServer');
const { InputListener } = require('./inputListener');
const { loadProfile, saveProfile } = require('./profileStore');
const { listAbilities } = require('./abilityData');

let mainWindow;
let tray;
let overlay;
let inputListener;

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

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
        { label: 'Show', click: () => mainWindow?.show() },
        { label: 'Quit', click: () => app.quit() }
      ])
    );
  } catch (err) {
    console.warn('Tray icon not available, skipping tray setup:', err.message);
  }
}

async function bootstrap() {
  let profile = await loadProfile();

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
    saveProfile(profile).catch((err) =>
      console.warn('Could not persist active style bar:', err.message)
    );
    mainWindow?.webContents.send('style-bar-changed', barId);
  });
  inputListener.start();

  ipcMain.handle('profile:get', () => profile);
  ipcMain.handle('profile:save', async (_event, nextProfile) => {
    await saveProfile(nextProfile);
    // Keep the outer `profile` reference in sync too - style-bar-changed
    // events mutate `profile.activeStyleBarId` directly (see above), which
    // would otherwise be mutating a stale object once the renderer has
    // saved a newer one.
    profile = nextProfile;
    inputListener.updateProfile(nextProfile);
    overlay.broadcastProfileMeta(nextProfile.settings);
    return { ok: true };
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

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // Keep the overlay server + input listener alive even if the setup
  // window is closed, since OBS may still be reading the overlay.
  if (process.platform !== 'darwin') {
    // no-op: app stays alive via tray
  }
});

app.on('before-quit', () => {
  inputListener?.stop();
  overlay?.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

// Checks GitHub Releases for a newer version than the one currently
// running, and hands back enough info for the UI to offer (never force) an
// update. Works identically whether this is a packaged portable .exe or
// running from source via `npm run dev`/`npm start` - both read the same
// `version` field, just via different paths (Electron's app.getVersion()
// reads the packaged app's own package.json when built, and the nearest
// package.json when run unpackaged).
//
// Deliberately does NOT auto-download or auto-install anything: this app
// ships as an unsigned portable .exe with no code-signing certificate, so
// a background "we already replaced your exe" auto-updater isn't something
// this can safely or convincingly claim to do. Instead this just surfaces
// "a newer version exists" plus a link to the GitHub release, and leaves
// grabbing/replacing the .exe to the person, same as how they got this one.
const { app, net } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const REPO_OWNER = 'cuddlyzebra';
const REPO_NAME = 'pvm-pulse';
const RELEASES_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// Don't hit the GitHub API more than once per this window per launch chain
// - a single person's usage (opening the app, minimizing to tray, reopening
// it) could otherwise fire this far more often than is useful. GitHub's own
// unauthenticated rate limit is 60/hr/IP, which one person's normal usage
// wouldn't hit anyway, but there's no reason to check more than a couple of
// times a day even so.
const MIN_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'update-settings.json');
}

async function loadSettings() {
  try {
    const raw = await fs.readFile(getSettingsPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveSettings(settings) {
  try {
    await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
    await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    // Not being able to remember "already checked recently" or "skipped
    // this version" just means the app checks a bit more often / re-shows
    // a skipped banner - never worth failing anything else over.
    console.warn('Could not save update-settings.json:', err.message);
  }
}

// Parses "1.2.3", "v1.2.3", or "1.2.3-beta.2" into comparable parts. Returns
// null for anything that doesn't look like a version at all, so a
// non-semver release tag just gets ignored rather than crashing the check.
function parseVersion(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/^v/i, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : null
  };
}

function comparePrereleaseParts(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] === undefined) return -1; // fewer parts sorts lower (semver rule)
    if (b[i] === undefined) return 1;
    const aNum = /^\d+$/.test(a[i]);
    const bNum = /^\d+$/.test(b[i]);
    if (aNum && bNum) {
      const diff = Number(a[i]) - Number(b[i]);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else {
      if (a[i] === b[i]) continue;
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

// Returns -1 if a < b, 0 if equal, 1 if a > b - standard semver precedence,
// including that a version WITHOUT a prerelease tag outranks the same
// major.minor.patch WITH one (1.1.0 > 1.1.0-beta.1).
function compareVersions(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return comparePrereleaseParts(a.prerelease, b.prerelease);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url });
    request.setHeader('User-Agent', 'PvM-Pulse-Update-Check');
    request.setHeader('Accept', 'application/vnd.github+json');
    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => {
        body += chunk.toString();
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          // A brand-new repo with no releases published yet returns 404
          // here - that's an entirely normal state (not every version has
          // to be published as a GitHub release), so this is treated as
          // "no update info available" rather than an error worth
          // surfacing to the person using the app.
          reject(new Error(`GitHub API returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function pickWindowsAsset(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  // Prefer an actual .exe asset; fall back to a .zip (e.g. if it's shipped
  // zipped the same way this app is normally sent out) rather than
  // returning nothing just because the naming doesn't match exactly.
  const exe = assets.find((a) => /\.exe$/i.test(a.name));
  if (exe) return exe.browser_download_url;
  const zip = assets.find((a) => /\.zip$/i.test(a.name));
  if (zip) return zip.browser_download_url;
  return null;
}

async function fetchLatestRelease() {
  const release = await fetchJson(RELEASES_API_URL);
  const latest = parseVersion(release.tag_name || release.name);
  if (!latest) throw new Error(`Latest release tag "${release.tag_name}" is not a recognizable version`);
  return {
    latest,
    tagName: release.tag_name,
    releaseUrl: release.html_url,
    downloadUrl: pickWindowsAsset(release),
    notes: typeof release.body === 'string' ? release.body : ''
  };
}

// options.force skips the "checked recently" throttle (used for an
// explicit "Check for updates" click) but never skips/clears a
// previously-skipped version - that's a separate, explicit action
// (skipVersion below).
async function checkForUpdate({ force = false } = {}) {
  const settings = await loadSettings();
  const currentVersion = app.getVersion();
  const current = parseVersion(currentVersion) || { major: 0, minor: 0, patch: 0, prerelease: null };

  const now = Date.now();
  const checkedRecently =
    !force && settings.lastCheckedAt && now - settings.lastCheckedAt < MIN_CHECK_INTERVAL_MS;

  if (checkedRecently && settings.lastResult) {
    return { ...settings.lastResult, currentVersion, fromCache: true };
  }

  let result;
  try {
    const { latest, tagName, releaseUrl, downloadUrl, notes } = await fetchLatestRelease();
    const isNewer = compareVersions(current, latest) < 0;
    result = {
      ok: true,
      updateAvailable: isNewer,
      currentVersion,
      latestVersion: tagName?.replace(/^v/i, '') || `${latest.major}.${latest.minor}.${latest.patch}`,
      tagName,
      releaseUrl,
      downloadUrl,
      notes,
      skippedVersion: settings.skippedVersion || null
    };
  } catch (err) {
    // Anything from here (no internet, GitHub unreachable, no releases
    // published yet, a proxy/firewall blocking it, a malformed tag) just
    // means "couldn't check right now" - never something to interrupt or
    // alarm the person over, since update checks are pure bonus
    // functionality on top of an app that works fine without them.
    result = {
      ok: false,
      updateAvailable: false,
      currentVersion,
      error: err.message,
      skippedVersion: settings.skippedVersion || null
    };
  }

  await saveSettings({
    ...settings,
    lastCheckedAt: now,
    lastResult: result
  });

  return { ...result, fromCache: false };
}

async function skipVersion(version) {
  const settings = await loadSettings();
  await saveSettings({ ...settings, skippedVersion: version });
}

module.exports = { checkForUpdate, skipVersion, compareVersions, parseVersion };

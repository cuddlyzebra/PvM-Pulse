#!/usr/bin/env node
/**
 * Downloads real dyed-weapon/armour icons from the RS3 wiki and records
 * which ones actually exist, so PvM Pulse can offer dyed gear as bindable
 * items alongside their undyed versions.
 *
 * WHY THIS SCRIPT EXISTS (rather than the icons just being bundled already):
 * RotationMaster - the source everything else in data/abilityinfo.json comes
 * from - doesn't track dyed variants at all, only base gear. The wiki does
 * have a distinct icon image per dyed variant, confirmed via
 * https://runescape.wiki/w/Drygore_longsword_(shadow) - but this needs to
 * run from a machine that can actually reach runescape.wiki (the sandbox
 * this project is normally built in cannot), so it's a script you run
 * locally rather than something pre-fetched for you.
 *
 * INCREMENTAL BY DESIGN: this script is safe (and fast) to re-run. It loads
 * whatever it already found last time from data/dyed-abilityinfo.json and
 * skips re-downloading anything it already has a saved icon file for - it
 * only spends new requests on items/colours it hasn't resolved yet. This
 * matters for two reasons: (1) each full pass is a lot of requests (~57
 * items x 7 colours x up to 3 casing guesses), and the wiki can start
 * rate-limiting a run that hammers it with that many requests repeatedly in
 * a short time; (2) it means a previous successful run's results are never
 * discarded just because a later run got interrupted or partially blocked -
 * results only ever accumulate, never shrink.
 *
 * If the wiki does start rate-limiting mid-run (HTTP 429/503), this stops
 * early with a clear message rather than silently recording everything
 * else as "not found" - which would otherwise look identical to those
 * items genuinely not having a dyed version.
 *
 * NO SEPARATE MERGE STEP NEEDED. electron/abilityData.js reads
 * data/dyed-abilityinfo.json and merges it into the ability list live, on
 * every app start - so as soon as this script finishes, just start the app
 * (or reload it) and dyed items are there. Because it's a separate file
 * from data/abilityinfo.json (the base set an app update ships a fresh
 * copy of), a future update to the app can never wipe out what you've
 * already fetched here.
 *
 * Usage:
 *   node scripts/fetch-dyed-icons.js
 *
 * Output:
 *   data/icons/dyed/<slug>.png       - the downloaded icons
 *   data/dyed-abilityinfo.json       - what was found so far; read live by
 *                                       electron/abilityData.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'dye-weapons-manifest.json'), 'utf-8')
);
const ICONS_DIR = path.join(ROOT, 'data', 'icons', 'dyed');
const FOUND_PATH = path.join(ROOT, 'data', 'dyed-abilityinfo.json');
// One-time migration: earlier versions of this script wrote here instead.
// If you have old results there and nothing yet at the new path, adopt them
// automatically rather than silently starting over.
const LEGACY_FOUND_PATH = path.join(__dirname, 'dyed-icons-found.json');

const USER_AGENT =
  'PvM-Pulse-icon-fetcher/1.0 (personal RS3 overlay tool; contact via GitHub repo)';

// A handful of consecutive rate-limit responses is treated as "the wiki is
// throttling us right now" rather than "these items don't exist" - worth
// stopping for rather than burning through the whole remaining list
// recording false negatives.
const RATE_LIMIT_STATUSES = new Set([429, 503]);
const MAX_CONSECUTIVE_RATE_LIMITS = 5;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

class RateLimitedError extends Error {
  constructor(status) {
    super(`HTTP ${status} (rate limited)`);
    this.rateLimited = true;
  }
}

// Follows redirects itself (Special:FilePath 302s to the actual CDN URL) -
// Node's https.get doesn't follow redirects automatically.
function fetchBuffer(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': USER_AGENT }, timeout: 15000 },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          maxRedirects > 0
        ) {
          res.resume(); // discard this response body
          const next = new URL(res.headers.location, url).toString();
          fetchBuffer(next, maxRedirects - 1).then(resolve, reject);
          return;
        }
        if (RATE_LIMIT_STATUSES.has(res.statusCode)) {
          res.resume();
          reject(new RateLimitedError(res.statusCode));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const contentType = res.headers['content-type'] || '';
        if (!contentType.startsWith('image/')) {
          res.resume();
          reject(new Error(`not an image (content-type: ${contentType})`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function filePathUrl(fileTitle) {
  // MediaWiki's convenience redirect: resolves straight to the current
  // image for a given File: title without needing to know its CDN hash
  // path. Spaces become underscores in the title, same as any wiki URL.
  const encoded = encodeURIComponent(`${fileTitle}.png`).replace(/%20/g, '_');
  return `https://runescape.wiki/w/Special:FilePath/${encoded}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadExistingFound() {
  let sourcePath = FOUND_PATH;
  if (!fs.existsSync(sourcePath) && fs.existsSync(LEGACY_FOUND_PATH)) {
    console.log(`Migrating results from old location (${LEGACY_FOUND_PATH}) to ${FOUND_PATH}.`);
    sourcePath = LEGACY_FOUND_PATH;
  }
  if (!fs.existsSync(sourcePath)) return new Map();
  try {
    const list = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    return new Map(list.map((entry) => [entry.action, entry]));
  } catch (err) {
    console.warn(`Couldn't parse existing ${sourcePath}, starting fresh:`, err.message);
    return new Map();
  }
}

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  // Seed from whatever a previous run already found, so this run only ever
  // adds to it (see the incremental-by-design note at the top of the file).
  const foundByName = loadExistingFound();
  const alreadyHave = foundByName.size;

  const notFound = [];
  let attempted = 0;
  let skippedAlreadyFound = 0;
  let consecutiveRateLimits = 0;
  let stoppedEarly = false;

  const weapons = manifest.weapons || [];
  const armour = manifest.armour || [];
  const items = [...weapons, ...armour];
  console.log(
    `Manifest loaded: ${weapons.length} weapons + ${armour.length} armour pieces = ${items.length} items, x ${Object.keys(manifest.dyeColorCasings).length} dye colours.`
  );
  if (alreadyHave > 0) {
    console.log(`${alreadyHave} already found from a previous run - only checking what's new.`);
  }
  console.log('');

  outer: for (const [index, item] of items.entries()) {
    // Marks the handoff from weapons to armour in the console output, and
    // gives a running "N of total" so a run that looks stalled can be told
    // apart from one that's still working - this list is big enough that a
    // full first-time run can take several minutes.
    if (index === weapons.length && armour.length > 0) {
      console.log(`\n--- switching to armour (${armour.length} pieces) ---\n`);
    }
    console.log(`[${index + 1}/${items.length}] checking: ${item.action}`);
    for (const [color, casings] of Object.entries(manifest.dyeColorCasings)) {
      const displayName = `${item.action} (${color})`;

      // Already resolved in a previous run AND the icon file is still on
      // disk - nothing to do, don't spend a request re-confirming it.
      const existing = foundByName.get(displayName);
      if (existing && fs.existsSync(path.join(ROOT, 'data', 'icons', existing.icon))) {
        skippedAlreadyFound += 1;
        continue;
      }

      let success = null;
      for (const casing of casings) {
        const fileTitle = `${item.action} (${casing})`;
        attempted += 1;
        try {
          const buf = await fetchBuffer(filePathUrl(fileTitle));
          // The wiki serves a small generic "no image" placeholder for a
          // handful of edge cases instead of a clean 404 - anything under
          // ~300 bytes is almost certainly that, not a real icon.
          if (buf.length < 300) throw new Error('suspiciously small, skipping');
          success = { fileTitle, buf };
          consecutiveRateLimits = 0;
          break;
        } catch (err) {
          if (err.rateLimited) {
            consecutiveRateLimits += 1;
            if (consecutiveRateLimits >= MAX_CONSECUTIVE_RATE_LIMITS) {
              console.warn(
                `\nThe wiki has rate-limited the last ${consecutiveRateLimits} requests in a row - stopping here rather than recording the rest as "not found" (which would be wrong, not just slow).`
              );
              console.warn('Everything found so far is already saved. Wait a few minutes and run this again to pick up where it left off.');
              stoppedEarly = true;
              break outer;
            }
          }
          // Otherwise try the next casing variant silently - a single
          // failed casing guess is expected, not worth logging.
        }
        await sleep(200); // be polite to the wiki's servers
      }

      if (success) {
        const slug = slugify(displayName);
        const filename = `${slug}.png`;
        fs.writeFileSync(path.join(ICONS_DIR, filename), success.buf);
        foundByName.set(displayName, {
          action: displayName,
          tag: item.tag,
          icon: `dyed/${filename}`,
          sourceTitle: success.fileTitle
        });
        console.log(`  found:     ${displayName}`);
      } else if (!success && consecutiveRateLimits === 0) {
        notFound.push(displayName);
      }
    }
  }

  const found = Array.from(foundByName.values()).sort((a, b) => a.action.localeCompare(b.action));
  fs.writeFileSync(FOUND_PATH, JSON.stringify(found, null, 2));

  console.log(`\n${attempted} lookups attempted this run (${skippedAlreadyFound} already-found combinations skipped).`);
  console.log(`${found.length} dyed icons total now saved to data/icons/dyed/ (${found.length - alreadyHave} new this run).`);
  console.log(`${notFound.length} combinations checked this run don't exist on the wiki (expected - not every item supports every dye).`);
  if (stoppedEarly) {
    console.log(`\nStopped early due to rate limiting - re-run later to continue.`);
  }
  console.log(`\nWrote ${FOUND_PATH}. (Re)start the app (npm run dev, or the packaged .exe) and dyed items will be in the search list - no merge step needed.`);
}

main().catch((err) => {
  console.error('Fetch run failed:', err.message);
  console.error('Anything already found in a previous run is safe - re-run this script to try again.');
  process.exit(1);
});

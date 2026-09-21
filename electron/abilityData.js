const fs = require('fs');
const path = require('path');

// data/abilityinfo.json is the base set, built by scripts/build-ability-data.py
// directly from RotationMaster's icon library - name and icon always come
// from the same source, no separate matching step.
//
// data/dyed-abilityinfo.json is a SEPARATE, optional file written by
// scripts/fetch-dyed-icons.js (dyed weapons/armour pulled from the wiki -
// RotationMaster doesn't track those at all). Keeping it as its own file,
// merged in here at load time rather than baked into abilityinfo.json, is
// deliberate: abilityinfo.json gets overwritten wholesale whenever the app
// itself is updated (a new RotationMaster snapshot, more categories, etc.),
// and an update that ships a fresh abilityinfo.json should never silently
// wipe out dyed items you already fetched. Since this file merges the two
// live, on every app start, dyed items just keep showing up after any
// future update - no re-merge step to remember.
let cache = null;

function loadAbilityData() {
  if (cache) return cache;

  const basePath = path.join(__dirname, '..', 'data', 'abilityinfo.json');
  let base;
  try {
    base = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
  } catch (err) {
    // Previously this read wasn't wrapped at all - a missing/corrupt base
    // file would throw with no context, and (since nothing between here and
    // the renderer catches it either) the ability list would just silently
    // stay empty with no clue why. Failing loudly with the actual path is
    // worth the extra noise if this ever happens again.
    throw new Error(`Failed to load base ability data from ${basePath}: ${err.message}`);
  }
  if (!Array.isArray(base) || base.length === 0) {
    console.warn(
      `${basePath} loaded but has ${Array.isArray(base) ? 'zero' : 'no'} items - ` +
        'the search list will be missing every combat ability and undyed weapon/armour entry.'
    );
  }

  const map = new Map(base.map((entry) => [entry.action, entry]));

  // Older versions of scripts/fetch-dyed-icons.js wrote here instead -
  // fall back to it so dyed items still show up even if the app happens to
  // start before that script has been re-run to migrate to the new path
  // (fetch-dyed-icons.js migrates automatically when it does run, but the
  // app shouldn't require that extra run just to see items it already has
  // on disk).
  const dyedPath = path.join(__dirname, '..', 'data', 'dyed-abilityinfo.json');
  const legacyDyedPath = path.join(__dirname, '..', 'scripts', 'dyed-icons-found.json');
  const resolvedDyedPath = fs.existsSync(dyedPath)
    ? dyedPath
    : fs.existsSync(legacyDyedPath)
      ? legacyDyedPath
      : null;

  if (resolvedDyedPath) {
    try {
      const dyed = JSON.parse(fs.readFileSync(resolvedDyedPath, 'utf-8'));
      for (const entry of dyed) {
        map.set(entry.action, entry);
      }
    } catch (err) {
      console.warn(`Could not read ${resolvedDyedPath}, skipping dyed items:`, err.message);
    }
  }

  cache = map;
  return cache;
}

function getAbility(name) {
  return loadAbilityData().get(name);
}

function listAbilities() {
  return Array.from(loadAbilityData().values()).sort((a, b) => a.action.localeCompare(b.action));
}

module.exports = { getAbility, listAbilities };

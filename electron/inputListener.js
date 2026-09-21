const { EventEmitter } = require('events');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { getAbility } = require('./abilityData');

// uiohook reports raw keycodes; we only need a small reverse-lookup from
// UiohookKey's numeric codes back to the same human-readable strings the
// setup UI captures and stores in the profile (e.g. "f1", "space", "a").
const KEYCODE_TO_NAME = Object.fromEntries(
  Object.entries(UiohookKey).map(([name, code]) => [code, name.toLowerCase()])
);

function normalizeModifier(name) {
  if (!name) return null;
  if (name.startsWith('shift')) return 'shift';
  if (name.startsWith('ctrl')) return 'ctrl';
  if (name.startsWith('alt')) return 'alt';
  return null;
}

/**
 * Listens for global key presses and resolves them against the user's
 * keybind profile, emitting a 'cast' event the instant a bound key is
 * pressed.
 *
 * This deliberately does not simulate RuneScape's global cooldown or
 * per-ability cooldowns (the original LeMageTank tracker did, queueing an
 * ability until the GCD cleared). Client-side key detection can't actually
 * know true in-game cooldown state - a failed cast, a stun, or a misclick
 * would all make a simulated cooldown wrong regardless of how accurate the
 * underlying ability data is. Showing every keybind press immediately is
 * simpler and doesn't claim an accuracy it can't back up.
 *
 * STYLE BARS: a profile can define multiple "style bars" (melee/ranged/
 * magic, say), each optionally with a "weapon trigger" keybind - the same
 * key you press in-game to swap gear. Pressing that key here switches which
 * bar is "active" and every subsequent ability lookup resolves against that
 * bar first. If that same key is ALSO bound to an ability/weapon on
 * whichever bar was active *before* the switch (see WEAPON-SWAP DISPLAY
 * below), that one still casts - the switch doesn't swallow it. A keybind
 * with no styleBarId (or, for profiles
 * saved before style bars existed, simply no styleBarId field at all) is
 * "shared" - it resolves no matter which bar is active, so defensives,
 * movement, prayer flicks etc. don't need to be duplicated per bar. If the
 * SAME physical key is bound both to the active bar specifically and as a
 * shared keybind, the bar-specific one wins - lets one style override a
 * shared default for just that key. If a key is bound only to a
 * *different*, inactive bar (not shared, not the active bar), it resolves
 * to nothing while that other bar is active, rather than firing the wrong
 * style's ability.
 *
 * TOGGLE KEYS: more than one *enabled* bar can share the same weapon
 * trigger key - this is deliberate, not a conflict. RS3's built-in gear
 * swap is often a single physical key that toggles between exactly two
 * loadouts, and which two styles that represents changes per fight (e.g.
 * melee/magic one fight, melee/ranged the next). A bar that isn't relevant
 * this session gets disabled (StyleBar.enabled = false) rather than having
 * its trigger key removed, which excludes it from this entirely. Pressing
 * a trigger key shared by N enabled bars advances to the next of those N
 * bars after whichever is currently active (wrapping around) - with
 * exactly one enabled bar on that key (the common case), that's just a
 * direct switch, same as before this existed. Disabled bars are skipped
 * both here and by the dedicated cycle key, but stay selectable manually
 * and keep their own keybinds intact.
 *
 * WEAPON-SWAP DISPLAY: a weapon-trigger key (or the cycle key) can ALSO
 * have an ordinary ability/weapon keybind on the bar it's switching FROM -
 * bind e.g. "Fractured staff of Armadyl" under a melee bar's own tab, on
 * the same key that bar uses as its weapon trigger to a magic bar. Pressing
 * that key then does both: the icon shows on the overlay (resolved against
 * the bar that was active when the key was pressed, same as any other
 * keybind), and the style switch still happens right after - mirroring how
 * RuneScape's own weapon-swap key both re-equips your weapon and changes
 * your ability bar for real. Bind something on the bar being switched TO as
 * well, on the same key, and swapping back the other way shows that one
 * instead - each side of the swap can show its own icon, or neither.
 */
class InputListener extends EventEmitter {
  constructor(profile) {
    super();
    this.paused = false;
    this.activeModifier = null;
    this.activeStyleBarId = profile.activeStyleBarId ?? null;
    this.setProfile(profile);
  }

  setProfile(profile) {
    this.profile = profile;
    this._rebuildMaps();
  }

  // Called when the setup UI saves profile edits (keybinds, bar list, etc.)
  // mid-session. Deliberately does NOT reset activeStyleBarId to whatever
  // was last persisted - if you're mid-fight and tweak a keybind, saving
  // shouldn't silently kick you back to a different style bar than the one
  // you're actually using.
  updateProfile(profile) {
    const keepActiveStyleBarId = this.activeStyleBarId;
    this.profile = profile;
    this._rebuildMaps();
    this.activeStyleBarId = keepActiveStyleBarId;
  }

  _rebuildMaps() {
    // bindKey -> Keybind[] (usually one entry, but the same physical key
    // can legitimately be bound differently per style bar, e.g. "d" for
    // both Wild Magic on a magic bar and Greater Flurry on a melee bar).
    this.keybindsByBindKey = new Map();
    for (const bind of this.profile.keybinds || []) {
      const k = this._bindKey(bind.key, bind.modifier);
      if (!this.keybindsByBindKey.has(k)) this.keybindsByBindKey.set(k, []);
      this.keybindsByBindKey.get(k).push(bind);
    }

    // bindKey -> style bar id[], for weapon-swap keys that trigger a silent
    // bar switch. Usually one bar per key, but see the TOGGLE KEYS note
    // above the class - several enabled bars can share a key, in which
    // case pressing it cycles through just that group. Disabled bars are
    // left out entirely, both as a trigger and as a switch target.
    this.weaponTriggerByBindKey = new Map();
    for (const bar of this.profile.styleBars || []) {
      if (bar.enabled === false) continue;
      if (bar.weaponTrigger?.key) {
        const k = this._bindKey(bar.weaponTrigger.key, bar.weaponTrigger.modifier);
        if (!this.weaponTriggerByBindKey.has(k)) this.weaponTriggerByBindKey.set(k, []);
        this.weaponTriggerByBindKey.get(k).push(bar.id);
      }
    }

    // A dedicated key that advances to the next style bar, wrapping around -
    // a manual fallback alongside weapon-trigger auto-switching.
    this.cycleBarBindKey = null;
    const cycleKey = this.profile.settings?.cycleBarKey;
    if (cycleKey?.key) {
      this.cycleBarBindKey = this._bindKey(cycleKey.key, cycleKey.modifier);
    }
  }

  setPaused(paused) {
    this.paused = paused;
  }

  // Manual override from the setup UI (clicking a bar directly), separate
  // from weapon-trigger auto-detection and the cycle key.
  setActiveStyleBar(barId) {
    this.activeStyleBarId = barId;
    this.emit('style-bar-changed', barId);
  }

  _cycleStyleBar() {
    // Disabled bars are sat out of the manual cycle key too, same as
    // weapon-trigger switching - they stay configured, just not part of
    // the active rotation.
    const bars = (this.profile.styleBars || []).filter((b) => b.enabled !== false);
    if (bars.length === 0) return;
    const currentIndex = bars.findIndex((b) => b.id === this.activeStyleBarId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % bars.length;
    this.setActiveStyleBar(bars[nextIndex].id);
  }

  _bindKey(key, modifier) {
    return `${(modifier || '').toLowerCase()}+${(key || '').toLowerCase()}`;
  }

  // Picks which bound ability (if any) a key resolves to right now, given
  // the active style bar - see the style-bar explainer in the class doc
  // comment above for the precedence rules.
  _resolveAbility(bindKey) {
    const candidates = this.keybindsByBindKey.get(bindKey);
    if (!candidates || candidates.length === 0) return null;

    const specific = candidates.find(
      (b) => b.styleBarId && b.styleBarId === this.activeStyleBarId
    );
    if (specific) return specific.ability;

    const shared = candidates.find((b) => !b.styleBarId);
    if (shared) return shared.ability;

    return null;
  }

  start() {
    uIOhook.on('keydown', this._onKeyDown.bind(this));
    uIOhook.on('keyup', this._onKeyUp.bind(this));
    uIOhook.start();
  }

  stop() {
    uIOhook.stop();
  }

  _onKeyDown(event) {
    if (this.paused) return;
    const keyName = KEYCODE_TO_NAME[event.keycode];
    if (!keyName) return;

    const modifier = normalizeModifier(keyName);
    if (modifier) {
      this.activeModifier = modifier;
      return;
    }

    const bindKey = this._bindKey(keyName, this.activeModifier);

    // Resolve (and fire) any ability bound to this key against whichever
    // bar is active *right now*, before any style switch below takes
    // effect - see WEAPON-SWAP DISPLAY above. Most cycle/weapon-trigger
    // keys won't have anything bound here, in which case this is a no-op,
    // same as before this existed.
    const actionName = this._resolveAbility(bindKey);
    if (actionName) {
      const info = getAbility(actionName);
      this.emit('cast', {
        action: actionName,
        tag: info?.tag ?? 'misc',
        // Filename under data/icons/ (e.g. "rend.webp"), resolved once here.
        // Every ability in data/abilityinfo.json currently has a matching
        // icon (sourced together from RotationMaster), so this should
        // rarely be null in practice - it stays optional defensively in
        // case an ability gets added to the profile without one later.
        icon: info?.icon ?? null,
        timestamp: Date.now()
      });
    }

    if (this.cycleBarBindKey && bindKey === this.cycleBarBindKey) {
      this._cycleStyleBar();
      return;
    }

    // When more than one enabled bar shares this key (see TOGGLE KEYS
    // above), advance to whichever of them comes after the currently
    // active bar, wrapping around; with only one bar on the key this is
    // just a direct switch.
    const triggerGroup = this.weaponTriggerByBindKey.get(bindKey);
    if (triggerGroup && triggerGroup.length > 0) {
      const currentIndex = triggerGroup.indexOf(this.activeStyleBarId);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % triggerGroup.length;
      const nextBarId = triggerGroup[nextIndex];
      if (nextBarId !== this.activeStyleBarId) {
        this.setActiveStyleBar(nextBarId);
      }
    }
  }

  _onKeyUp(event) {
    const keyName = KEYCODE_TO_NAME[event.keycode];
    if (normalizeModifier(keyName) === this.activeModifier) {
      this.activeModifier = null;
    }
  }
}

module.exports = { InputListener };

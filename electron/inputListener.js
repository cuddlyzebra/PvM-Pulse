const { EventEmitter } = require('events');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { getAbility } = require('./abilityData');

// uiohook reports raw keycodes; we only need a small reverse-lookup from
// UiohookKey's numeric codes back to the same human-readable strings the
// setup UI captures and stores in the profile (e.g. "f1", "space", "a").
const KEYCODE_TO_NAME = Object.fromEntries(
  Object.entries(UiohookKey).map(([name, code]) => [code, name.toLowerCase()])
);

// How soon a repeat of the exact same ability is treated as spam (key-repeat
// from holding a key down, or rapid mashing) and dropped rather than shown
// again - see SPAM COLLAPSING below. A real, deliberate repeat of the same
// ability - which does happen, e.g. a movement/defensive used twice in a
// row on purpose - is only this fast in edge cases, so 1s is a reasonable
// line between "still holding the key" and "pressed it again, later."
const REPEAT_SUPPRESS_MS = 1000;

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
 *
 * SPAM COLLAPSING: mashing (or key-repeating on) the same bound key doesn't
 * flood the overlay with a fresh icon for every single press - a repeat of
 * whichever ability was cast most recently (lastCastAction/lastCastAt) is
 * dropped if it comes in within REPEAT_SUPPRESS_MS of the last one that was
 * actually shown. This is a cooldown on the REPEAT, not a one-shot "never
 * show this ability twice in a row" rule - press the same key again after
 * that window and it shows again completely normally, so an intentional
 * repeat (a defensive or movement ability used twice on purpose, say) still
 * comes through fine as long as it's not faster than a human could
 * plausibly intend. Casting a different ability in between is unaffected
 * either way, and pausing/resuming or switching style bars both clear the
 * tracked ability entirely, so a repeat right after either of those always
 * shows immediately regardless of timing.
 *
 * CLICK ZONES (advanced/experimental): alongside keybinds, a profile can
 * also bind an ability to a screen position (profile.clickZones) - a
 * global mouse click within `radius` pixels of that position casts it, the
 * same as a bound key would. This exists for the in-game action bar, which
 * has no keybind at all for some players' setups. Unlike a keybind, a
 * click zone only means anything as long as the ability bar stays exactly
 * where it was when the zone was recorded - move it, resize it, or change
 * UI scale, and every zone needs re-picking (the setup UI's "re-pick
 * location" button does this in place, without losing the zone's ability
 * or style-bar assignment). Style-bar precedence, shared zones, and spam
 * collapsing all work exactly the same way as for keybinds - see
 * _resolveClickZone and _tryCast below.
 */
class InputListener extends EventEmitter {
  constructor(profile) {
    super();
    this.paused = false;
    this.activeModifier = null;
    this.activeStyleBarId = profile.activeStyleBarId ?? null;
    // See SPAM COLLAPSING in the class doc comment above.
    this.lastCastAction = null;
    this.lastCastAt = 0;
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
    // A repeat right after pausing/resuming (e.g. to type a password mid-
    // fight, then get straight back into it) should always show, not get
    // silently eaten as a "duplicate" of whatever was cast before the
    // pause - see SPAM COLLAPSING above.
    this.lastCastAction = null;
    this.lastCastAt = 0;
  }

  // Waits for the next real mouse click anywhere on screen and resolves
  // with its position, for the setup UI to record a click zone - see
  // CLICK ZONES above. That click is consumed by _onMouseDown below rather
  // than also being checked against existing zones/causing a cast. Only
  // one capture is ever pending at a time; starting a new one (or calling
  // cancelCaptureClickZone) resolves whichever was already waiting with
  // null instead of leaving it hanging forever.
  captureNextClick() {
    return new Promise((resolve) => {
      this.cancelCaptureClickZone();
      this._captureResolve = resolve;
    });
  }

  cancelCaptureClickZone() {
    if (this._captureResolve) {
      this._captureResolve(null);
      this._captureResolve = null;
    }
  }

  // Manual override from the setup UI (clicking a bar directly), separate
  // from weapon-trigger auto-detection and the cycle key.
  setActiveStyleBar(barId) {
    this.activeStyleBarId = barId;
    // A fresh style means a fresh dedup streak - see SPAM COLLAPSING above.
    this.lastCastAction = null;
    this.lastCastAt = 0;
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

  // Same style-bar precedence as _resolveAbility above, but by screen
  // position instead of a key: among every zone the click actually falls
  // within (there's normally just one, but zones can overlap if placed
  // close together), a zone specific to the active bar wins over a shared
  // one. A profile with no click zones at all (the common case - see
  // CLICK ZONES above) skips this with no real cost, since the list is
  // empty and both passes below are instant no-ops.
  _resolveClickZone(x, y) {
    const candidates = (this.profile.clickZones || []).filter((zone) => {
      const dx = x - zone.x;
      const dy = y - zone.y;
      return Math.sqrt(dx * dx + dy * dy) <= (zone.radius ?? 26);
    });
    if (candidates.length === 0) return null;

    const specific = candidates.find((z) => z.styleBarId && z.styleBarId === this.activeStyleBarId);
    if (specific) return specific.ability;

    const shared = candidates.find((z) => !z.styleBarId);
    if (shared) return shared.ability;

    return null;
  }

  // Shared by both a resolved keybind and a resolved click zone - see
  // SPAM COLLAPSING above for what this actually guards against.
  _tryCast(actionName) {
    if (!actionName) return;
    const now = Date.now();
    const isSpamRepeat =
      actionName === this.lastCastAction && now - this.lastCastAt < REPEAT_SUPPRESS_MS;
    if (isSpamRepeat) return;

    this.lastCastAction = actionName;
    this.lastCastAt = now;
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
      timestamp: now
    });
  }

  start() {
    uIOhook.on('keydown', this._onKeyDown.bind(this));
    uIOhook.on('keyup', this._onKeyUp.bind(this));
    uIOhook.on('mousedown', this._onMouseDown.bind(this));
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
    this._tryCast(this._resolveAbility(bindKey));

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

  _onMouseDown(event) {
    // If a click zone is being calibrated right now (see captureNextClick
    // above), this click is the calibration click itself - hand its
    // position back to whoever's waiting and stop here. It must NOT also
    // be treated as a real cast, even if it happens to land inside an
    // existing zone (e.g. re-picking a zone that's slightly off).
    if (this._captureResolve) {
      const resolve = this._captureResolve;
      this._captureResolve = null;
      resolve({ x: event.x, y: event.y });
      return;
    }

    if (this.paused) return;

    this._tryCast(this._resolveClickZone(event.x, event.y));
  }
}

module.exports = { InputListener };

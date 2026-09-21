/**
 * Normalizes a browser KeyboardEvent's `key` into the same key-name format
 * the global listener (electron/inputListener.js, via uiohook-napi's
 * UiohookKey) uses to match presses against a saved profile.
 *
 * Letters, digits, F-keys, arrows, Escape etc. already agree once
 * lowercased - the browser reports "A"/"F1"/"ArrowLeft", uiohook names its
 * keys the same way, so `.toLowerCase()` alone is enough for those. Symbol
 * keys don't: the browser reports the literal typed character (";", "/",
 * "'", "-", "="...), while uiohook calls them by name ("semicolon", "slash",
 * "quote", "minus", "equal"...). Without translating, capturing one of
 * these in the setup UI looked bound but silently matched nothing when
 * actually pressed in-game - the same category of mismatch spacebar had
 * (" " vs "space"), just for every punctuation key instead of just one.
 */
const BROWSER_KEY_TO_UIOHOOK_NAME: Record<string, string> = {
  ' ': 'space',
  ';': 'semicolon',
  '=': 'equal',
  ',': 'comma',
  '-': 'minus',
  '.': 'period',
  '/': 'slash',
  '`': 'backquote',
  '[': 'bracketleft',
  '\\': 'backslash',
  ']': 'bracketright',
  "'": 'quote'
};

// Reverse of the above, for displaying a saved key back to the user as the
// symbol they actually pressed rather than uiohook's internal name (showing
// "slash" instead of "/" would work but reads worse).
const UIOHOOK_NAME_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(BROWSER_KEY_TO_UIOHOOK_NAME)
    .filter(([rawKey]) => rawKey !== ' ') // "space" stays as the word "space", not a blank label
    .map(([rawKey, name]) => [name, rawKey])
);

export function normalizeCapturedKey(rawKey: string): string {
  return BROWSER_KEY_TO_UIOHOOK_NAME[rawKey] ?? rawKey.toLowerCase();
}

export function formatKeyLabel(key: string): string {
  return UIOHOOK_NAME_TO_SYMBOL[key] ?? key;
}

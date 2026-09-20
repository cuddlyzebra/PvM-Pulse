// The overlay server (electron/overlayServer.js) serves data/icons/ as
// static files at this fixed local port. Used anywhere in the setup UI
// that needs to show an ability's icon as a visual double-check - the
// search list, keybind rows, and the live preview strip.
const ICON_BASE_URL = 'http://127.0.0.1:5859/data/icons';

export function iconUrl(icon: string | null | undefined): string | null {
  if (!icon) return null;
  // icon can be a plain filename ("foo.png") or, for dyed weapons, a
  // subfolder-qualified path ("dyed/foo.png") - encode each path segment
  // separately so the "/" stays a real path separator instead of becoming
  // %2F (which express.static won't resolve back into a subfolder).
  const encodedPath = icon.split('/').map(encodeURIComponent).join('/');
  return `${ICON_BASE_URL}/${encodedPath}`;
}

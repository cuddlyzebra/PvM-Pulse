import { useState } from 'react';

export default function OverlayLinkPanel({ overlayUrl }: { overlayUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="overlay-link-panel">
      <p className="hint">
        In OBS: Add Source → Browser Source → paste this URL. Background is transparent, no file
        paths to hunt down.
      </p>
      <div className="overlay-url-row">
        <code>{overlayUrl || 'starting…'}</code>
        <button onClick={copy} disabled={!overlayUrl}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

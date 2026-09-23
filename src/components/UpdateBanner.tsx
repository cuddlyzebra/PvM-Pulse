import type { UpdateCheckResult } from '../types';

interface UpdateBannerProps {
  result: UpdateCheckResult;
  onDismiss: () => void;
  onSkip: () => void;
}

// A quiet, dismissible strip - never a modal, never anything that blocks
// using the app. Shown only when App.tsx has confirmed there's actually a
// newer version and it hasn't already been skipped; see the startup check
// and the "Check for Updates…" button that drive it.
export default function UpdateBanner({ result, onDismiss, onSkip }: UpdateBannerProps) {
  return (
    <div className="update-banner">
      <span className="update-banner-text">
        PvM Pulse <strong>v{result.latestVersion}</strong> is available - you're on v
        {result.currentVersion}.
      </span>
      <div className="update-banner-actions">
        <button
          type="button"
          className="update-banner-view"
          onClick={() => window.updates.openUrl(result.downloadUrl || result.releaseUrl || '')}
        >
          View release
        </button>
        <button type="button" className="update-banner-skip" onClick={onSkip} title="Don't show this version again">
          Skip this version
        </button>
        <button type="button" className="update-banner-dismiss" onClick={onDismiss} title="Dismiss for now">
          ✕
        </button>
      </div>
    </div>
  );
}

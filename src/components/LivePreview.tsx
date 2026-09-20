import type { CastEvent } from '../types';
import { iconUrl } from '../iconUrl';

export default function LivePreview({ casts, iconCount }: { casts: CastEvent[]; iconCount: number }) {
  const visible = casts.slice(0, iconCount);
  return (
    <div className="live-preview">
      <p className="hint">Live preview (mirrors what OBS shows):</p>
      <div className="live-preview-strip">
        {visible.length === 0 && <span className="empty-state">Cast an ability to see it appear here.</span>}
        {visible.map((cast, i) => (
          <div key={`${cast.timestamp}-${i}`} className="preview-icon" title={cast.action}>
            {iconUrl(cast.icon) ? (
              <img src={iconUrl(cast.icon)!} alt={cast.action} />
            ) : (
              <span className="preview-icon-fallback">{cast.action}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

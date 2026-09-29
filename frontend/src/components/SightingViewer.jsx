import { useCallback, useEffect, useState } from 'react';
import { Camera, Clock, Film, Image as ImageIcon, X } from 'lucide-react';
import { evidenceUrl, snapshotUrl } from '../utils/snapshot';

/**
 * One sighting, full size.
 *
 * The evidence used to sit inline in the timeline: a floated thumbnail and a
 * video element per row. With twenty sightings that is twenty video players
 * competing for layout and bandwidth, and the result overlapped the text it
 * was supposed to describe. Evidence is something an operator opens
 * deliberately, one at a time, so it belongs in a viewer rather than in the
 * list.
 */
export default function SightingViewer({ sighting, lang, onClose }) {
  const [tab, setTab] = useState('still');

  // Escape closes, and the page behind must not scroll while this is open.
  const handleKey = useCallback((event) => {
    if (event.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previous;
    };
  }, [handleKey]);

  if (!sighting) return null;

  const still = sighting.evidenceStill && sighting.evidenceToken
    ? evidenceUrl(sighting.evidenceStill, sighting.evidenceToken) : '';
  const clip = sighting.evidenceClip && sighting.evidenceClipToken
    ? evidenceUrl(sighting.evidenceClip, sighting.evidenceClipToken) : '';
  const face = sighting.snapshot && sighting.snapshotToken
    ? snapshotUrl(sighting.snapshot, sighting.snapshotToken) : '';

  const camera = sighting.camera?.name || sighting.cam;
  const where = sighting.camera?.building ? `${sighting.camera.building} · ${camera}` : camera;

  return (
    <div className="sv-backdrop" onClick={onClose} role="presentation">
      <div className="sv" onClick={(event) => event.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={lang ? 'تفاصيل الرصد' : 'Sighting detail'}>
        <header className="sv-head">
          <div>
            <b>{where}</b>
            <span className="sv-when"><Clock size={12} /> {sighting.whenLabel}</span>
          </div>
          <div className="sv-tabs">
            {still ? (
              <button className={tab === 'still' ? 'on' : ''} onClick={() => setTab('still')}>
                <ImageIcon size={14} /> {lang ? 'الصورة' : 'Still'}
              </button>
            ) : null}
            {clip ? (
              <button className={tab === 'clip' ? 'on' : ''} onClick={() => setTab('clip')}>
                <Film size={14} /> {lang ? 'المقطع' : 'Clip'}
              </button>
            ) : null}
            {face ? (
              <button className={tab === 'face' ? 'on' : ''} onClick={() => setTab('face')}>
                <Camera size={14} /> {lang ? 'الوجه' : 'Face'}
              </button>
            ) : null}
          </div>
          <button className="sv-close" onClick={onClose} aria-label={lang ? 'إغلاق' : 'Close'}>
            <X size={18} />
          </button>
        </header>

        <div className="sv-body">
          {tab === 'clip' && clip ? (
            // An animated WebP, not a video: OpenCV on the AI host can only
            // encode MPEG-4 Part 2, which browsers will not decode, so the
            // clip used to load perfectly and play as a blank rectangle.
            // Only mounted when chosen, so opening a sighting does not pull
            // footage the operator may never look at.
            <img src={clip} alt={lang ? 'مقطع الرصد' : 'Sighting clip'} className="sv-clip" />
          ) : tab === 'face' && face ? (
            <img src={face} alt={lang ? 'الوجه الملتقط' : 'Captured face'} className="sv-face" />
          ) : still ? (
            <img src={still} alt={lang ? 'الصورة الكاملة' : 'Full frame'} />
          ) : (
            <div className="sub">{lang ? 'لا توجد صورة محفوظة' : 'No image saved for this sighting'}</div>
          )}
        </div>

        <footer className="sv-foot">
          <span>{lang ? 'الثقة' : 'Confidence'} {sighting.conf}%</span>
          {clip ? <span>{lang ? 'المقطع: ٦ ث قبل · ٥ ث بعد' : 'Clip: 6s before · 5s after'}</span> : null}
          {still ? (
            <a href={still} target="_blank" rel="noreferrer">
              {lang ? 'فتح الأصل' : 'Open original'}
            </a>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

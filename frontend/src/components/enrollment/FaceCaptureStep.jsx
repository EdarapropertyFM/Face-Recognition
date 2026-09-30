import { useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, ChevronsLeft, ChevronsRight, Glasses, RefreshCw, Smartphone, Sun, VideoOff } from 'lucide-react';
import EnrollmentProgress from './EnrollmentProgress';
import { FACE_POSES, useFaceCapture } from '../../hooks/useFaceCapture';
import { unlockCaptureSound } from '../../utils/captureSound';

/**
 * Uber-style face capture step:
 *  - Full-width camera fills the card
 *  - Dark overlay with a large oval cutout
 *  - Instruction at top, live status pill at bottom of the feed
 *  - Three dot-steps show progress (front / left / right)
 *  - Captures fire automatically, with a shutter pop sound
 */
export default function FaceCaptureStep({ initialCaptures, onBack, onComplete, onCapturesChange, onAiPersonId }) {
  // Intro first (tips + Start), like Uber's selfie check. The Start tap also
  // unlocks the capture sound on iPhone. Skipped when resuming with photos.
  const [started, setStarted] = useState(initialCaptures.length > 0);
  const {
    videoRef, cameraState, captures, poseIndex, message, error, turn, turnQuality,
    holdProgress, currentPose, startCamera, restartCapture,
  } = useFaceCapture({ initialCaptures, onCapturesChange, onAiPersonId, autoStart: started });
  // The preview is mirrored, so "turn left" means toward the left of the screen.
  const side = currentPose.key === 'left' ? 'left' : currentPose.key === 'right' ? 'right' : null;

  if (!started) {
    return (
      <section className="enrollment-card face-capture-step" aria-labelledby="fc-intro-title">
        <EnrollmentProgress currentStep={2} totalSteps={5} />
        <div className="fc-intro">
          <div className="fc-intro-art" aria-hidden="true"><div className="fc-intro-oval" /></div>
          <p className="enrollment-step-label" style={{ margin: 0 }}>Step 2 of 5</p>
          <h1 id="fc-intro-title" className="fc-title">Let's take 3 quick photos</h1>
          <p className="fc-subtitle">Look straight, then turn left, then right. It takes about 10 seconds and photos are taken automatically.</p>
          <ul className="fc-tips">
            <li><Sun size={18} aria-hidden="true" /> Find good light on your face</li>
            <li><Glasses size={18} aria-hidden="true" /> Remove hats, sunglasses and masks</li>
            <li><Smartphone size={18} aria-hidden="true" /> Hold the phone at eye level</li>
          </ul>
          <button className="enrollment-button" type="button" onClick={() => { unlockCaptureSound(); setStarted(true); }}>
            <Camera size={18} /> Start
          </button>
          <button className="enrollment-button secondary" type="button" onClick={onBack} style={{ marginTop: 10 }}>
            <ArrowLeft size={18} /> Back
          </button>
        </div>
      </section>
    );
  }

  const complete  = cameraState === 'complete';
  const enrolling = cameraState === 'enrolling';
  const duplicate = cameraState === 'duplicate';
  const failed    = cameraState === 'enroll-failed';
  const isActive  = cameraState === 'active';

  const pillClass = [
    'fc-pill',
    error              ? 'fc-pill--error'   : '',
    holdProgress > 0 && !error ? 'fc-pill--ready' : '',
  ].join(' ').trim();

  return (
    <section className="enrollment-card face-capture-step" aria-labelledby="fc-title">
      {/* ── Wizard progress bar ─────────────────── */}
      <EnrollmentProgress currentStep={2} totalSteps={5} />

      {/* ── Heading row ─────────────────────────── */}
      <div className="fc-header">
        <p className="enrollment-step-label" style={{ margin: 0 }}>Step 2 of 5</p>
        <h1 id="fc-title" className="fc-title">Take your photo</h1>
        <p className="fc-subtitle">
          Position your face inside the oval and follow the prompts. Photos are taken automatically — no button needed.
        </p>
      </div>

      {/* ── Camera area ─────────────────────────── */}
      <div className={`fc-camera-wrap ${complete ? 'fc-camera-wrap--done' : ''}`}>

        {/* Live instruction banner */}
        <div className="fc-instruction" aria-live="polite" aria-atomic="true">
          {complete
            ? '✅ All done!'
            : `${currentPose.emoji} ${currentPose.title}`}
        </div>

        {/* Video + overlays */}
        <div className="fc-viewport">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />

          {/* Oval overlay — dark surround + white oval border */}
          <div className="fc-shade" aria-hidden="true">
            <div className={`fc-oval ${holdProgress > 0 ? 'fc-oval--locking' : ''} ${complete ? 'fc-oval--done' : ''}`} />
          </div>

          {/* Side poses: big arrow toward the side to turn, and a turn meter. */}
          {cameraState === 'active' && side && (
            <>
              {/* The arrow points the way; once the turn is far enough it
                  goes green, and if the head goes past the point where the
                  far eye is lost it warns instead of staying green. */}
              <div className={`fc-turn-arrow fc-turn-arrow--${side} fc-turn-arrow--${turnQuality}`} aria-hidden="true">
                {side === 'left' ? <ChevronsLeft size={54} /> : <ChevronsRight size={54} />}
              </div>
              {/* A band to land in, not a bar to max out. The old meter
                  filled to 100% at the minimum turn and stayed there, so
                  turning too far showed a full green bar while every frame
                  was being refused. */}
              <div className={`fc-turn-meter fc-turn-meter--${side} fc-turn-meter--${turnQuality}`}
                role="meter" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(turn, 1) * 100)}
                aria-label={turnQuality === 'over' ? 'Turned too far'
                  : turnQuality === 'good' ? 'Turn is correct' : 'Keep turning'}>
                <span style={{ width: `${Math.round(Math.min(turn, 1) * 100)}%` }} />
                <i className="fc-turn-target" aria-hidden="true" />
              </div>
              <div className={`fc-turn-label fc-turn-label--${turnQuality}`}>
                {turnQuality === 'over' ? 'Too far — come back a little'
                  : turnQuality === 'good' ? 'Good angle — hold it'
                  : 'Keep turning'}
              </div>
            </>
          )}

          {/* Hold-to-capture progress arc (bar at bottom of oval) */}
          {isActive && holdProgress > 0 && (
            <div className="fc-hold-bar">
              <span style={{ width: `${Math.min(holdProgress, 1) * 100}%` }} />
            </div>
          )}

          {/* Live feedback pill — floats above hold bar */}
          {(isActive || enrolling) && (
            <div className="fc-pill-wrap" aria-live="polite">
              <span className={pillClass}>{error || message}</span>
            </div>
          )}

          {/* Non-active state overlay */}
          {/* Photo taken: brief white flash, like a camera shutter. */}
          <div key={captures.length} className={captures.length ? 'fc-flash' : ''} aria-hidden="true" />

          {!isActive && (
            <div className="fc-state-overlay">
              {(cameraState === 'starting' || enrolling)
                ? <RefreshCw className="spin" size={40} />
                : complete
                  ? <div className="fc-done-ring"><Check size={32} /></div>
                  : <VideoOff size={36} />}
              <span>
                {complete   ? 'Face photos saved!'
                : enrolling ? 'Saving securely…'
                : duplicate ? 'Already registered'
                : failed    ? 'Capture failed'
                : cameraState === 'starting' ? 'Starting camera…'
                : 'Camera is off'}
              </span>
              {(duplicate || failed) && error && (
                <p className="fc-state-sub">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Three step dots ─────────────────────── */}
        <div className="fc-dots" role="list" aria-label="Photo progress">
          {FACE_POSES.map((pose, i) => {
            const done    = Boolean(captures[i]);
            const current = i === poseIndex && !complete;
            return (
              <div
                key={pose.key}
                className={`fc-dot ${done ? 'fc-dot--done' : ''} ${current ? 'fc-dot--current' : ''}`}
                role="listitem"
                aria-label={`${pose.short}: ${done ? 'captured' : current ? 'now' : 'pending'}`}
              >
                <div className="fc-dot-thumb">
                  {done
                    ? <img src={captures[i].image} alt={`${pose.short} captured`} style={{ transform: 'scaleX(-1)' }} />
                    : done ? null : <span className="fc-dot-num">{i + 1}</span>}
                  {done && <div className="fc-dot-check"><Check size={10} /></div>}
                </div>
                <small className="fc-dot-label">{pose.short}</small>
              </div>
            );
          })}
        </div>

        {/* Hint text under dots */}
        {!complete && !failed && (
          <p className="fc-hint">Hold still when the oval glows green — the photo fires automatically.</p>
        )}

        {/* Camera error retry */}
        {cameraState === 'error' && (
          <button className="fc-retry" type="button" onClick={startCamera}>
            <Camera size={15} /> Allow camera access
          </button>
        )}
      </div>

      {/* ── Navigation ──────────────────────────── */}
      <div className="enrollment-actions" style={{ marginTop: '20px' }}>
        <button className="enrollment-button secondary" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        {complete ? (
          <button className="enrollment-button" type="button" onClick={onComplete}>
            Continue <ArrowRight size={18} />
          </button>
        ) : (
          <button
            className="enrollment-button secondary" type="button" onClick={restartCapture}
            disabled={enrolling || (!captures.length && !duplicate && !failed)}
          >
            <RefreshCw size={16} /> {duplicate ? 'Try different person' : 'Start over'}
          </button>
        )}
      </div>
    </section>
  );
}

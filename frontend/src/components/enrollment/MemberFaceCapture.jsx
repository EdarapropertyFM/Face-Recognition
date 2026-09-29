import { Camera, Check, RefreshCw, VideoOff, X } from 'lucide-react';
import { FACE_POSES, useFaceCapture } from '../../hooks/useFaceCapture';

/**
 * The owner's face capture, shrunk to fit inside a household member card.
 *
 * It reuses the same hook as the main step, so a member gets the identical
 * quality gate, pose prompts and duplicate check — including being refused if
 * that face is already registered to somebody else.
 */
export default function MemberFaceCapture({ memberName, initialCaptures, onCapturesChange, onAiPersonId, onDone, onCancel }) {
  const {
    videoRef, cameraState, captures, poseIndex, message, error,
    holdProgress, currentPose, startCamera, restartCapture,
  } = useFaceCapture({ initialCaptures, onCapturesChange, onAiPersonId });

  const complete = cameraState === 'complete';
  const enrolling = cameraState === 'enrolling';
  const duplicate = cameraState === 'duplicate';

  return (
    <div className="member-capture">
      <div className="member-capture-head">
        <b>{complete ? 'Face capture complete' : `Capturing ${memberName || 'this person'}`}</b>
        <button type="button" onClick={onCancel} aria-label="Close face capture"><X size={16} /></button>
      </div>

      <div className="member-capture-stage">
        <div className="member-capture-instruction" aria-live="polite">
          {complete ? 'All three photos are ready' : duplicate ? 'Already registered' : `${currentPose.emoji ?? ''} ${currentPose.title}`}
        </div>
        <div className="member-capture-viewport">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />
          {cameraState !== 'active' && (
            <div className="member-capture-state">
              {cameraState === 'starting' || enrolling
                ? <RefreshCw size={26} className="spin" />
                : complete ? <Check size={30} /> : <VideoOff size={26} />}
              <span>{complete ? 'Enrolled'
                : enrolling ? 'Adding to the gallery…'
                : duplicate ? 'Already registered'
                : cameraState === 'starting' ? 'Starting camera…' : 'Camera is off'}</span>
            </div>
          )}
          {cameraState === 'active' && holdProgress > 0 && (
            <div className="member-capture-hold"><span style={{ width: `${Math.min(holdProgress, 1) * 100}%` }} /></div>
          )}
        </div>
        <strong className={`member-capture-message ${error ? 'error' : ''}`}>{error || message}</strong>
      </div>

      <div className="member-capture-poses">
        {FACE_POSES.map((pose, index) => (
          <span key={pose.key} className={`${captures[index] ? 'done' : ''} ${index === poseIndex && !complete ? 'current' : ''}`}>
            {captures[index] ? <Check size={12} /> : index + 1} {pose.short}
          </span>
        ))}
      </div>

      <div className="member-capture-actions">
        {cameraState === 'error' && (
          <button type="button" className="enrollment-button secondary" onClick={startCamera}>
            <Camera size={15} /> Try camera again
          </button>
        )}
        {(captures.length > 0 || duplicate) && !enrolling && (
          <button type="button" className="enrollment-button secondary" onClick={restartCapture}>
            <RefreshCw size={15} /> {duplicate ? 'Try another person' : 'Start over'}
          </button>
        )}
        {complete && (
          <button type="button" className="enrollment-button" onClick={onDone}>
            <Check size={15} /> Done
          </button>
        )}
      </div>
    </div>
  );
}

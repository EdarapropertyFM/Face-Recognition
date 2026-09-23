import { ArrowLeft, ArrowRight, Camera, Check, RefreshCw, ShieldCheck, VideoOff } from 'lucide-react';
import EnrollmentProgress from './EnrollmentProgress';
import { FACE_POSES, useFaceCapture } from '../../hooks/useFaceCapture';

export default function FaceCaptureStep({ initialCaptures, onBack, onComplete, onCapturesChange }) {
  const {
    videoRef, cameraState, captures, poseIndex, message, error,
    holdProgress, currentPose, startCamera, restartCapture,
  } = useFaceCapture({ initialCaptures, onCapturesChange });
  const complete = cameraState === 'complete';

  return (
    <section className="enrollment-card face-capture-step" aria-labelledby="face-capture-title">
      <EnrollmentProgress currentStep={2} totalSteps={5} />
      <p className="enrollment-step-label">Step 2 of 5 · Face capture</p>
      <h1 id="face-capture-title">Guided face capture</h1>
      <p className="enrollment-subtitle">Keep the camera open and follow each instruction. The AI captures automatically as soon as the face is clear and steady.</p>

      <div className={`camera-stage ${complete ? 'is-complete' : ''}`}>
        <div className="camera-instruction" aria-live="polite">
          {complete ? 'Face capture complete' : currentPose.title}
        </div>
        <div className="camera-viewport">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />
          <div className="camera-shade" aria-hidden="true"><span /></div>
          {cameraState !== 'active' ? (
            <div className="camera-state">
              {cameraState === 'starting' ? <RefreshCw className="spin" size={32} /> : complete ? <Check size={38} /> : <VideoOff size={34} />}
              <span>{complete ? 'Five photos captured' : cameraState === 'starting' ? 'Starting camera…' : 'Camera is off'}</span>
            </div>
          ) : null}
          {cameraState === 'active' && holdProgress > 0 ? (
            <div className="camera-hold"><span style={{ width: `${Math.min(holdProgress, 1) * 100}%` }} /></div>
          ) : null}
        </div>
        <strong className={`camera-message ${error ? 'error' : ''}`}>{error || message}</strong>
        {!complete ? <small>Follow the pose prompt; the AI checks one face, sharpness and stability before each automatic capture.</small> : null}
        {cameraState === 'error' ? (
          <button className="camera-retry" type="button" onClick={startCamera}><Camera size={16} /> Try camera again</button>
        ) : null}
      </div>

      <div className="capture-poses" aria-label="Required face photos">
        {FACE_POSES.map((pose, index) => {
          const capture = captures[index];
          const current = index === poseIndex && !complete;
          return (
            <div className={`capture-pose ${capture ? 'done' : ''} ${current ? 'current' : ''}`} key={pose.key}>
              {capture ? <img src={capture.image} alt={`${pose.short} captured`} /> : <span>{index + 1}</span>}
              <small>{pose.short}</small>
              {capture ? <i><Check size={13} /></i> : null}
            </div>
          );
        })}
      </div>

      <div className="capture-security-note"><ShieldCheck size={17} /> Validation only — enrollment remains pending until admin approval.</div>

      <div className="enrollment-actions">
        <button className="enrollment-button secondary" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        {complete ? (
          <button className="enrollment-button" type="button" onClick={onComplete}>
            Continue <ArrowRight size={18} />
          </button>
        ) : (
          <button className="enrollment-button secondary" type="button" onClick={restartCapture} disabled={!captures.length}>
            <RefreshCw size={18} /> Start over
          </button>
        )}
      </div>
    </section>
  );
}

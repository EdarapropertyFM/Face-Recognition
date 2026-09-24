import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';

export const FACE_POSES = [
  { key: 'front', title: 'Look straight at the camera', short: 'Front' },
  { key: 'left', title: 'Turn your head slightly left', short: 'Left' },
  { key: 'right', title: 'Turn your head slightly right', short: 'Right' },
  { key: 'stepBack', title: 'Step back a little', short: 'Step back' },
  { key: 'betterLighting', title: 'Face a window or a light', short: 'Better light' },
];

// Matches the dwell behavior used by the Python AI enrolment session.
const CHECK_INTERVAL_MS = 400;
const REQUIRED_STABLE_CHECKS = 2;
const MIN_CAPTURE_GAP_MS = 1500;

// The AI rejects faces narrower than detection.min_face_size_px (80px), and a
// face typically spans about a fifth of a centred head-and-shoulders frame. At
// 480 that lands right on the limit, so an otherwise good capture can fail with
// "too small"; 640 keeps normal framing comfortably clear of it. Five frames at
// this size stay well inside the backend's 3mb JSON limit.
const CAPTURE_SIZE = 640;

function frameFromVideo(video) {
  if (!video?.videoWidth || !video?.videoHeight) return null;
  const canvas = document.createElement('canvas');
  const sourceSize = Math.min(video.videoWidth, video.videoHeight);
  const sourceX = (video.videoWidth - sourceSize) / 2;
  const sourceY = (video.videoHeight - sourceSize) / 2;
  // Never upscale. Enlarging a small frame would inflate the face width the AI
  // measures without adding any detail, turning a real "too small" rejection
  // into a silent pass with a weak embedding.
  const size = Math.min(CAPTURE_SIZE, Math.round(sourceSize));
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d', { alpha: false }).drawImage(
    video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size,
  );
  return canvas.toDataURL('image/jpeg', 0.88);
}

function qualityHint(quality) {
  const reason = quality?.reasons?.[0] ?? '';
  if (reason.startsWith('too small')) return 'Move closer to the camera';
  if (reason.startsWith('too blurry')) return 'Hold the phone steady';
  if (reason.startsWith('too turned') || reason.startsWith('too tilted')) return 'Turn slightly toward the camera';
  return reason || 'Adjust your face inside the oval';
}

function poseResult(pose, quality, captures) {
  if (!quality?.passed) return { accepted: false, hint: qualityHint(quality) };
  // The AI model uses each pose as a friendly prompt, not as another strict
  // rejection gate. This avoids confusing left/right failures on phone cameras.
  void pose;
  void captures;
  return { accepted: true, hint: 'Good quality — hold still' };
}

export function useFaceCapture({ initialCaptures = [], onCapturesChange, onAiPersonId }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const checkingRef = useRef(false);
  const stableChecksRef = useRef(0);
  const lastCaptureAtRef = useRef(0);
  const capturesRef = useRef(initialCaptures);
  const poseIndexRef = useRef(initialCaptures.length);
  const mountedRef = useRef(true);
  const startVersionRef = useRef(0);
  const onCapturesChangeRef = useRef(onCapturesChange);
  const onAiPersonIdRef = useRef(onAiPersonId);
  // The AI person created when the five photos were captured.
  const aiPersonIdRef = useRef(null);

  const [cameraState, setCameraState] = useState(initialCaptures.length >= FACE_POSES.length ? 'complete' : 'idle');
  const [captures, setCaptures] = useState(initialCaptures);
  const [poseIndex, setPoseIndex] = useState(initialCaptures.length);
  const [message, setMessage] = useState(initialCaptures.length >= FACE_POSES.length ? 'All five photos are ready' : 'Starting camera…');
  const [error, setError] = useState('');
  const [holdProgress, setHoldProgress] = useState(0);

  useEffect(() => {
    onAiPersonIdRef.current = onAiPersonId;
  }, [onAiPersonId]);

  useEffect(() => {
    onCapturesChangeRef.current = onCapturesChange;
  }, [onCapturesChange]);

  const stopCamera = useCallback(() => {
    startVersionRef.current += 1;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    checkingRef.current = false;
  }, []);

  // The five photos go into the AI gallery as soon as they are captured, so
  // the person is recognizable straight away. The id comes back for the draft
  // to carry; until an enrollment claims it the backend purges it.
  const enrollCaptures = useCallback(async (allCaptures) => {
    setCameraState('enrolling');
    setMessage('Adding the face to the gallery…');
    try {
      const response = await apiFetch('/enrollments/face-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: allCaptures.map((capture) => capture.image) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(Array.isArray(result.message) ? result.message.join(', ')
          : result.message || 'Could not add the face to the gallery.');
      }
      if (!mountedRef.current) return;
      aiPersonIdRef.current = result.aiPersonId;
      onAiPersonIdRef.current?.(result.aiPersonId);
      setCameraState('complete');
      setMessage('All five photos are ready and enrolled');
      setError('');
    } catch (enrollError) {
      if (!mountedRef.current) return;
      // Leave the captures in place so "Retake" is one click, but do not let
      // the wizard continue: without an AI person the registration is useless.
      setCameraState('enroll-failed');
      setMessage('Face enrollment failed');
      setError(enrollError.message || 'Could not add the face to the gallery.');
    }
  }, []);

  const checkFrame = useCallback(async () => {
    if (checkingRef.current || poseIndexRef.current >= FACE_POSES.length) return;
    const image = frameFromVideo(videoRef.current);
    if (!image) return;

    checkingRef.current = true;
    try {
      const response = await apiFetch('/enrollments/face-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send our own capture so matching it is not reported as a duplicate.
        body: JSON.stringify({ image_b64: image, aiPersonId: aiPersonIdRef.current ?? undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'AI camera check failed');
      if (!mountedRef.current) return;
      setError('');

      // Already in the gallery: stop here rather than letting them fill in
      // three more steps and be refused at submit.
      if (result.duplicate) {
        stableChecksRef.current = 0;
        setHoldProgress(0);
        setCameraState('duplicate');
        setMessage(result.matchedName
          ? `This face is already registered as ${result.matchedName}`
          : 'This face is already registered');
        setError('Already registered. If you believe this is a mistake, contact the building administrator.');
        stopCamera();
        return;
      }

      if (!result.ok) {
        stableChecksRef.current = 0;
        setHoldProgress(0);
        setMessage(result.reason || 'Move your face into the frame');
        return;
      }

      const currentPose = FACE_POSES[poseIndexRef.current];
      const evaluation = poseResult(currentPose, result.quality, capturesRef.current);
      setMessage(evaluation.hint);

      if (!evaluation.accepted) {
        stableChecksRef.current = 0;
        setHoldProgress(0);
        return;
      }

      const now = Date.now();
      if (now - lastCaptureAtRef.current < MIN_CAPTURE_GAP_MS) {
        setMessage(`${currentPose.short} saved — ${FACE_POSES[poseIndexRef.current + 1]?.title || 'finishing…'}`);
        return;
      }

      stableChecksRef.current += 1;
      setHoldProgress(stableChecksRef.current / REQUIRED_STABLE_CHECKS);
      if (stableChecksRef.current < REQUIRED_STABLE_CHECKS) return;

      const nextCapture = { key: currentPose.key, label: currentPose.short, image, quality: result.quality };
      const nextCaptures = [...capturesRef.current, nextCapture];
      capturesRef.current = nextCaptures;
      lastCaptureAtRef.current = now;
      setCaptures(nextCaptures);
      onCapturesChangeRef.current?.(nextCaptures);
      stableChecksRef.current = 0;
      setHoldProgress(0);

      const nextIndex = poseIndexRef.current + 1;
      poseIndexRef.current = nextIndex;
      setPoseIndex(nextIndex);
      if (nextIndex >= FACE_POSES.length) {
        stopCamera();
        await enrollCaptures(nextCaptures);
      } else {
        setMessage(`${currentPose.short} done — ${FACE_POSES[nextIndex].title}`);
      }
    } catch (requestError) {
      stableChecksRef.current = 0;
      setHoldProgress(0);
      setMessage('AI connection unavailable');
      setError(requestError.message || 'Could not reach the face verification service.');
    } finally {
      checkingRef.current = false;
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const startVersion = startVersionRef.current;
    setError('');
    setMessage('Allow camera access to begin');
    setCameraState('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support camera capture.');
      const stream = await navigator.mediaDevices.getUserMedia({
        // Ask for enough real pixels that the square crop reaches CAPTURE_SIZE;
        // the browser falls back to whatever the camera supports.
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280, min: CAPTURE_SIZE },
          height: { ideal: 720, min: 480 },
        },
        audio: false,
      });
      if (!mountedRef.current || startVersion !== startVersionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraState('active');
      setMessage(FACE_POSES[poseIndexRef.current].title);
      intervalRef.current = window.setInterval(checkFrame, CHECK_INTERVAL_MS);
    } catch (cameraError) {
      setCameraState('error');
      setError(cameraError.message || 'Camera permission was denied or no camera is available.');
      setMessage('Camera could not start');
    }
  }, [checkFrame, stopCamera]);

  const restartCapture = useCallback(() => {
    // Release the person enrolled by the previous attempt, otherwise the
    // retake matches it and the applicant is refused as a duplicate of
    // themselves until the hourly purge catches up.
    const previous = aiPersonIdRef.current;
    if (previous) {
      void apiFetch(`/enrollments/face-capture/${previous}`, { method: 'DELETE' })
        .catch(() => undefined);      // the purge job is the backstop
    }
    aiPersonIdRef.current = null;
    onAiPersonIdRef.current?.(null);
    capturesRef.current = [];
    poseIndexRef.current = 0;
    stableChecksRef.current = 0;
    lastCaptureAtRef.current = 0;
    setCaptures([]);
    setPoseIndex(0);
    setHoldProgress(0);
    setError('');
    onCapturesChangeRef.current?.([]);
    startCamera();
  }, [startCamera]);

  useEffect(() => {
    mountedRef.current = true;
    const startTimer = capturesRef.current.length < FACE_POSES.length
      ? window.setTimeout(startCamera, 0)
      : null;
    return () => {
      if (startTimer) window.clearTimeout(startTimer);
      mountedRef.current = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return {
    videoRef, cameraState, captures, poseIndex, message, error,
    holdProgress, currentPose: FACE_POSES[Math.min(poseIndex, FACE_POSES.length - 1)],
    startCamera, restartCapture, stopCamera,
  };
}

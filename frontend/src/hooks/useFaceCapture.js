import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { playCaptureDone, playCapturePop, unlockCaptureSound } from '../utils/captureSound';

export const FACE_POSES = [
  { key: 'front', title: 'Look straight at the camera', short: 'Front', emoji: '😊' },
  { key: 'left',  title: 'Slowly turn your head to the left', short: 'Left', emoji: '↩️' },
  { key: 'right', title: 'Now turn your head to the right', short: 'Right', emoji: '↪️' },
];

// Biometric capture: each pose is verified from the AI's own measurements
// (yaw, pitch, sharpness) and must be held steady before the photo is taken,
// so the three templates cover the core angles the recognizer needs.
const CHECK_INTERVAL_MS = 350;
const REQUIRED_STABLE_CHECKS = 2;        // ~0.7 s holding the correct pose — snappy
const MIN_CAPTURE_GAP_MS = 1200;         // time to move into the next pose
const MAX_YAW_JITTER_DEG = 10;           // head must be still, not mid-turn
const MIN_BLUR_SCORE = 62;               // just above the AI minimum (60); webcams reach 60-75

const FRONTAL_YAW = 10;                  // front photo: really straight on
const FRONTAL_PITCH = 20;
// Side photos must be a REAL turn: at least this far from the person's own
// front photo (the landmark yaw estimate reads a ~35-40 deg head turn as ~20).
const SIDE_TURN_MIN = 18;
const SIDE_TURN_RELAXED = 14;            // after POSE_FALLBACK_MS, never lower
const SIDE_YAW_MAX = 34;                 // both eyes stay visible (AI rejects > 35)
// Stuck on one pose this long: accept any good-quality frame so nobody is
// locked out of registering by a hard pose (glasses, a fixed camera...).
const POSE_FALLBACK_MS = 12000;

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
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  ctx.drawImage(video, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  // Mean brightness of the centre, where the face is: catches a dark or
  // blown-out face that the AI would still "detect".
  const c = Math.round(size * 0.3);
  const px = ctx.getImageData(c, c, size - 2 * c, size - 2 * c).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 16) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  return { image: canvas.toDataURL('image/jpeg', 0.92), brightness: sum / (px.length / 16) };
}

function qualityHint(quality) {
  const reason = quality?.reasons?.[0] ?? '';
  if (reason.startsWith('too small')) return 'Move closer to the camera';
  if (reason.startsWith('too blurry')) return 'Hold still, the photo is blurry';
  if (reason.startsWith('too turned')) return 'Turned too far, come back a little';
  if (reason.startsWith('too tilted')) return 'Keep your chin level';
  return reason || 'Adjust your face inside the oval';
}

/**
 * Whether this frame satisfies the current pose. `captures` are the photos
 * already taken, so later poses are judged against them (the second side must
 * be opposite the first; step back must be smaller than the front photo).
 */
/** How far this frame is turned from the front photo (0..1 of the required turn). */
export function turnProgress(pose, quality, captures, relaxed = false) {
  if (!quality || pose?.key === 'front') return 0;
  const frontYaw = captures.find((c) => c.key === 'front')?.quality?.yaw_deg ?? 0;
  const firstSide = captures.find((c) => c.key === 'left')?.quality?.yaw_deg;
  const turn = quality.yaw_deg - frontYaw;
  // The second side only counts when turned the other way from the first.
  if (pose.key === 'right' && firstSide !== undefined && Math.sign(turn) === Math.sign(firstSide - frontYaw)) return 0;
  return Math.min(1, Math.abs(turn) / (relaxed ? SIDE_TURN_RELAXED : SIDE_TURN_MIN));
}

function poseResult(pose, quality, captures, brightness, relaxed = false) {
  if (!quality?.passed) return { accepted: false, hint: qualityHint(quality) };
  // Being stuck relaxes sharpness/light and the turn a little, but a side
  // photo is never accepted without a real head turn.
  if (!relaxed && quality.blur_score < MIN_BLUR_SCORE) return { accepted: false, hint: 'Hold still, the photo is not sharp yet' };
  if (!relaxed && brightness < 55) return { accepted: false, hint: 'Your face is too dark, face a light' };
  if (!relaxed && brightness > 230) return { accepted: false, hint: 'Too much light on your face, move away from direct light' };

  const yaw = quality.yaw_deg;
  const pitch = quality.pitch_deg;
  const frontal = Math.abs(yaw) <= FRONTAL_YAW && Math.abs(pitch) <= FRONTAL_PITCH;
  switch (pose.key) {
    case 'front':
      if (Math.abs(pitch) > FRONTAL_PITCH) return { accepted: false, hint: 'Keep your chin level' };
      if (Math.abs(yaw) > FRONTAL_YAW) return { accepted: false, hint: 'Look straight at the camera' };
      return { accepted: true, hint: 'Perfect — hold still' };
    case 'left':
    case 'right': {
      const side = pose.key === 'left' ? 'left' : 'right';
      if (Math.abs(yaw) > SIDE_YAW_MAX) return { accepted: false, hint: 'A bit less — keep both eyes visible' };
      const progress = turnProgress(pose, quality, captures, relaxed);
      if (progress === 0 && pose.key === 'right') return { accepted: false, hint: 'Now turn to the OTHER side' };
      if (progress < 1) return { accepted: false, hint: progress < 0.4 ? `Turn your head to the ${side}` : `Keep turning ${side}…` };
      if (Math.abs(pitch) > FRONTAL_PITCH + 5) return { accepted: false, hint: 'Keep your chin level' };
      return { accepted: true, hint: 'Great — hold it there' };
    }
    default:
      return { accepted: frontal, hint: frontal ? 'Hold still' : 'Look straight at the camera' };
  }
}

export function useFaceCapture({ initialCaptures = [], onCapturesChange, onAiPersonId, autoStart = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const checkingRef = useRef(false);
  const stableChecksRef = useRef(0);
  const lastCaptureAtRef = useRef(0);
  const lastYawRef = useRef(null);
  const poseStartedAtRef = useRef(Date.now());
  const capturesRef = useRef(initialCaptures);
  const poseIndexRef = useRef(initialCaptures.length);
  const mountedRef = useRef(true);
  const startVersionRef = useRef(0);
  const onCapturesChangeRef = useRef(onCapturesChange);
  const onAiPersonIdRef = useRef(onAiPersonId);
  // The AI person created when the three photos were captured.
  const aiPersonIdRef = useRef(null);

  const [cameraState, setCameraState] = useState(initialCaptures.length >= FACE_POSES.length ? 'complete' : 'idle');
  const [captures, setCaptures] = useState(initialCaptures);
  const [poseIndex, setPoseIndex] = useState(initialCaptures.length);
  const [message, setMessage] = useState(initialCaptures.length >= FACE_POSES.length ? 'All three photos are ready' : 'Starting camera…');
  const [error, setError] = useState('');
  const [holdProgress, setHoldProgress] = useState(0);
  // 0..1: how far the head is turned toward the required side (side poses).
  const [turn, setTurn] = useState(0);

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

  // The three photos go into the AI gallery as soon as they are captured, so
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
      setMessage('All three photos captured and enrolled');
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
    const frame = frameFromVideo(videoRef.current);
    if (!frame) return;
    const { image, brightness } = frame;

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
      const relaxed = Date.now() - poseStartedAtRef.current > POSE_FALLBACK_MS;
      const evaluation = poseResult(currentPose, result.quality, capturesRef.current, brightness, relaxed);
      setTurn(turnProgress(currentPose, result.quality, capturesRef.current, relaxed));
      // A head still turning between checks gives a smeared, in-between angle.
      const yaw = result.quality?.yaw_deg;
      const moving = lastYawRef.current !== null && Math.abs(yaw - lastYawRef.current) > MAX_YAW_JITTER_DEG;
      lastYawRef.current = yaw;
      if (evaluation.accepted && moving) {
        evaluation.accepted = false;
        evaluation.hint = 'Hold still...';
      }
      setMessage(evaluation.hint);

      if (!evaluation.accepted) {
        stableChecksRef.current = 0;
        setHoldProgress(0);
        return;
      }

      const now = Date.now();
      if (now - lastCaptureAtRef.current < MIN_CAPTURE_GAP_MS) {
        setMessage(`Photo saved. Next: ${currentPose.title}`);
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
      
      // Pop + vibration per photo, a chime on the last one, so the person
      // knows when to switch pose without reading the screen.
      if (poseIndexRef.current + 1 >= FACE_POSES.length) playCaptureDone();
      else playCapturePop();

      stableChecksRef.current = 0;
      setHoldProgress(0);

      setTurn(0);
      const nextIndex = poseIndexRef.current + 1;
      poseIndexRef.current = nextIndex;
      poseStartedAtRef.current = Date.now() + MIN_CAPTURE_GAP_MS;
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
  }, [enrollCaptures, stopCamera]);

  const startCamera = useCallback(async () => {
    // Usually called from a tap (Start / Try again): unlock sound inside it.
    unlockCaptureSound();
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
      poseStartedAtRef.current = Date.now();
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
    lastYawRef.current = null;
    poseStartedAtRef.current = Date.now();
    setCaptures([]);
    setPoseIndex(0);
    setHoldProgress(0);
    setError('');
    onCapturesChangeRef.current?.([]);
    startCamera();
  }, [startCamera]);

  useEffect(() => {
    mountedRef.current = true;
    const startTimer = autoStart && capturesRef.current.length < FACE_POSES.length
      ? window.setTimeout(startCamera, 0)
      : null;
    return () => {
      if (startTimer) window.clearTimeout(startTimer);
      mountedRef.current = false;
      stopCamera();
    };
  }, [startCamera, stopCamera, autoStart]);

  return {
    videoRef, cameraState, captures, poseIndex, message, error, turn,
    holdProgress, currentPose: FACE_POSES[Math.min(poseIndex, FACE_POSES.length - 1)],
    startCamera, restartCapture, stopCamera,
  };
}

/**
 * Capture feedback. Three distinct sounds, because the person is looking into
 * the camera and cannot read the screen at the moment it matters:
 *
 *   ready   two soft rising blips the instant the oval turns green -- "you
 *           are in the right pose, hold still now"
 *   shutter a short, bright camera click when the photo is actually taken
 *   done    a rising chime after the last photo
 *
 * They must not be confusable: ready rises softly, the shutter is one hard
 * transient, so "hold" is never mistaken for "taken".
 *
 * Browsers (iOS Safari especially) only allow audio after a user gesture, and
 * the photos are taken automatically, not on a tap. So one AudioContext is
 * created and resumed on the Start tap (`unlockCaptureSound`) and reused for
 * every sound afterwards.
 */
let ctx = null;

export function unlockCaptureSound() {
  try {
    ctx = ctx ?? new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    // A silent blip inside the gesture fully unlocks output on iOS.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch { /* no audio support: captures still work silently */ }
}

function tone(from, to, start, length, volume = 0.35, type = 'sine') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length);
}

/**
 * The oval has just turned green: the pose is right, hold it.
 *
 * Deliberately quieter and softer than the shutter -- it is an invitation to
 * stay still, and a loud noise makes people flinch out of the pose.
 */
export function playHoldReady() {
  try { navigator.vibrate?.(18); } catch { /* not supported */ }
  try {
    if (!ctx) unlockCaptureSound();
    const t = ctx.currentTime;
    tone(520, 540, t, 0.07, 0.16);
    tone(780, 800, t + 0.075, 0.09, 0.16);
  } catch { /* ignore */ }
}

/** One photo taken: a camera click, then switch to the next pose. */
export function playShutterTick() {
  try { navigator.vibrate?.(35); } catch { /* not supported */ }
  try {
    if (!ctx) unlockCaptureSound();
    const t = ctx.currentTime;
    // A hard transient reads as a shutter; the short body under it stops the
    // click sounding like a glitch on small phone speakers.
    tone(2400, 1100, t, 0.035, 0.32, 'square');
    tone(1000, 420, t + 0.02, 0.07, 0.18);
  } catch { /* ignore */ }
}


/** All photos taken. */
export function playCaptureDone() {
  try { navigator.vibrate?.([40, 60, 40]); } catch { /* not supported */ }
  try {
    if (!ctx) unlockCaptureSound();
    // Offset so it reads as "click, then finished", not as one muddled noise.
    const t = ctx.currentTime + 0.12;
    tone(660, 660, t, 0.12, 0.3);
    tone(880, 880, t + 0.13, 0.12, 0.3);
    tone(1320, 1320, t + 0.26, 0.22, 0.3);
  } catch { /* ignore */ }
}

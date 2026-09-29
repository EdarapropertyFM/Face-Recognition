/**
 * Capture feedback: a short "pop" per photo and a rising chime when done,
 * plus a light vibration where supported (Android).
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

function tone(from, to, start, length, volume = 0.35) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length);
}

/** One photo taken: switch to the next pose. */
export function playCapturePop() {
  try { navigator.vibrate?.(40); } catch { /* not supported */ }
  try {
    if (!ctx) unlockCaptureSound();
    tone(900, 320, ctx.currentTime, 0.12);
  } catch { /* ignore */ }
}

/** All photos taken. */
export function playCaptureDone() {
  try { navigator.vibrate?.([40, 60, 40]); } catch { /* not supported */ }
  try {
    if (!ctx) unlockCaptureSound();
    const t = ctx.currentTime;
    tone(660, 660, t, 0.12, 0.3);
    tone(880, 880, t + 0.13, 0.12, 0.3);
    tone(1320, 1320, t + 0.26, 0.22, 0.3);
  } catch { /* ignore */ }
}

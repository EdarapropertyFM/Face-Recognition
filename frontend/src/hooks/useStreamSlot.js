import { useEffect, useRef, useState } from 'react';

/**
 * Rations the camera streams a page may hold open at once.
 *
 * Each live tile is an MJPEG response that never ends, so it occupies a
 * connection for as long as it is shown. A browser allows only about six per
 * origin over HTTP/1.1, and the realtime event stream takes one of those — so
 * a wall of cameras uses them all up and every other request on the page
 * (navigating, loading alerts, refreshing faces) queues behind them and
 * appears to hang.
 *
 * Streams also cost real work: each one runs the full recognition pipeline on
 * the AI service, so an off-screen tile is pure waste.
 *
 * Tiles therefore take a slot only while they are actually on screen, and
 * release it as soon as they scroll away or unmount.
 */

// Three leaves room for the event stream plus ordinary API calls: a browser
// allows about six per origin, and starving the rest of the app of
// connections is what makes every other page look like it loaded nothing.
export const MAX_CONCURRENT_STREAMS = 3;

let inUse = 0;
const waiting = new Set();

function notifyWaiting() {
  for (const wake of [...waiting]) wake();
}

/**
 * @param {boolean} wanted  whether this tile would like to stream right now
 * @returns {boolean}       whether it may
 */
export function useStreamSlot(wanted) {
  const [granted, setGranted] = useState(false);
  const heldRef = useRef(false);

  useEffect(() => {
    const release = () => {
      if (!heldRef.current) return;
      heldRef.current = false;
      inUse -= 1;
      setGranted(false);
      notifyWaiting();
    };

    if (!wanted) {
      release();
      return undefined;
    }

    const tryAcquire = () => {
      if (heldRef.current || inUse >= MAX_CONCURRENT_STREAMS) return;
      inUse += 1;
      heldRef.current = true;
      waiting.delete(tryAcquire);
      setGranted(true);
    };

    tryAcquire();
    if (!heldRef.current) waiting.add(tryAcquire);

    return () => {
      waiting.delete(tryAcquire);
      release();
    };
  }, [wanted]);

  return granted;
}

/** True while the element is on screen; used to decide if a tile wants a slot. */
export function useOnScreen(ref, rootMargin = '200px') {
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      // oxlint-disable-next-line react/set-state-in-effect -- no observer available
      setOnScreen(true);            // older browser: stream everything
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return onScreen;
}

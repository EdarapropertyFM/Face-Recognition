import { useEffect, useRef, useState } from 'react';
import { STREAMS_ARE_SEPARATE } from '../api';

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

// A browser allows about six concurrent connections per origin, and an MJPEG
// stream holds one open for as long as its tile is on screen.
//
// When streams have an origin of their own they only share it with the event
// stream, so four still leaves a spare and the app's own origin keeps its
// full budget. Sharing one origin (a LAN address or a tunnel) means the
// document, every module, every API call and the event stream all compete
// with them, so fewer are allowed.
export const MAX_CONCURRENT_STREAMS = STREAMS_ARE_SEPARATE ? 4 : 2;

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

/**
 * True while this browser tab is actually visible.
 *
 * Chrome heavily throttles background tabs, and an MJPEG connection left open
 * in one can stall and never resume: the socket stays established, the tile
 * shows "Connecting...", and nothing ever arrives. Dropping the stream when
 * the tab is hidden and asking for a fresh one on return replaces that dead
 * connection with a working one, and costs nothing while nobody is looking.
 */
export function usePageVisible() {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden');

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return visible;
}

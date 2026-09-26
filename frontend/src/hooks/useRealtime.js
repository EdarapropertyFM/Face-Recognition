import { useEffect, useRef } from 'react';
import { apiFetch, apiUrl } from '../api';

export function useRealtime(onEvent, enabled = true) {
  const handler = useRef(onEvent);
  useEffect(() => { handler.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (!enabled) return undefined;
    let source;
    let retryTimer;
    let stopped = false;

    // The token request is awaited before the EventSource exists, so a
    // navigation in that window used to run the cleanup against an undefined
    // `source` and the stream opened anyway, unclosed and unreachable. Every
    // such leak keeps one of the browser's ~6 connections per origin for good,
    // and once they are gone every fetch on every page hangs until a reload.
    // So re-check `stopped` after each await and close anything already open.
    const connect = async () => {
      try {
        const response = await apiFetch('/realtime/token', { method: 'POST' });
        if (stopped) return;
        const { token } = await response.json();
        if (stopped) return;
        if (!response.ok || !token) throw new Error('Realtime authorization failed');
        const opened = new EventSource(apiUrl(`/realtime/events?token=${encodeURIComponent(token)}`));
        if (stopped) { opened.close(); return; }
        source = opened;
        opened.addEventListener('stmc', (message) => {
          try { handler.current(JSON.parse(message.data)); } catch { /* ignore malformed event */ }
        });
        opened.onerror = () => {
          opened.close();
          if (source === opened) source = undefined;
          if (!stopped) retryTimer = window.setTimeout(connect, 3000);
        };
      } catch {
        if (!stopped) retryTimer = window.setTimeout(connect, 5000);
      }
    };
    connect();
    return () => { stopped = true; source?.close(); source = undefined; window.clearTimeout(retryTimer); };
  }, [enabled]);
}

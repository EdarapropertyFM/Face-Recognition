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

    const connect = async () => {
      try {
        const response = await apiFetch('/realtime/token', { method: 'POST' });
        const { token } = await response.json();
        if (!response.ok || !token) throw new Error('Realtime authorization failed');
        source = new EventSource(apiUrl(`/realtime/events?token=${encodeURIComponent(token)}`));
        source.addEventListener('stmc', (message) => {
          try { handler.current(JSON.parse(message.data)); } catch { /* ignore malformed event */ }
        });
        source.onerror = () => {
          source?.close();
          if (!stopped) retryTimer = window.setTimeout(connect, 3000);
        };
      } catch {
        if (!stopped) retryTimer = window.setTimeout(connect, 5000);
      }
    };
    connect();
    return () => { stopped = true; source?.close(); window.clearTimeout(retryTimer); };
  }, [enabled]);
}

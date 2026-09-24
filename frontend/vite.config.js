import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // Vite refuses requests for hostnames it does not know, so a tunnel would
    // otherwise return "Blocked request" instead of the app. A leading dot
    // matches subdomains. ngrok hands out .ngrok-free.dev today and
    // .ngrok-free.app on older accounts, so both families are listed.
    allowedHosts: [
      '.ngrok-free.dev', '.ngrok.dev',
      '.ngrok-free.app', '.ngrok.app', '.ngrok.io',
      '.trycloudflare.com', '.loca.lt',
    ],
    proxy: {
      // The browser asks this origin for /api and Vite forwards it to Nest, so
      // one tunnel serves the app and the API together. Without it a phone on
      // https://xxx.ngrok-free.app would call <that host>:3000, which does not
      // exist, and every request would fail.
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        // MJPEG camera streams are long-lived responses; no buffering, no timeout.
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          // The live wall holds an MJPEG connection per tile and an SSE
          // connection for events. Closing a tile, navigating away or
          // reloading tears those down, and the proxy reports the dropped
          // socket as an error — several stack traces per page change, which
          // buries anything real.
          //
          // Vite registers its own 'error' logger AFTER this hook runs, so the
          // only way to keep the expected ones quiet is to stop the event
          // reaching it. Anything that is not a disconnect still gets through,
          // notably ECONNREFUSED when the backend is not running.
          const EXPECTED = new Set(['ECONNRESET', 'ECONNABORTED', 'EPIPE']);
          const emit = proxy.emit.bind(proxy);
          proxy.emit = (event, ...args) => {
            const [error, , res] = args;
            if (event === 'error' && EXPECTED.has(error?.code)) {
              if (res && !res.headersSent && !res.writableEnded) res.end();
              return false;
            }
            return emit(event, ...args);
          };
        },
      },
    },
  },
})

import { isAllowedOrigin, parseFrontendOrigins } from './cors-origin';

const none = new Set<string>();

describe('parseFrontendOrigins', () => {
  it('splits, trims and drops blanks', () => {
    expect(parseFrontendOrigins(' https://a.com , https://b.com ,, '))
      .toEqual(new Set(['https://a.com', 'https://b.com']));
    expect(parseFrontendOrigins(undefined)).toEqual(none);
  });
});

describe('isAllowedOrigin', () => {
  it('allows a request with no Origin (same-origin, curl, the AI relay)', () => {
    expect(isAllowedOrigin(undefined, none)).toBe(true);
  });

  it('allows localhost and the office LAN', () => {
    for (const origin of [
      'http://localhost:5173', 'http://127.0.0.1:3000', 'http://[::1]:5173',
      'http://192.168.1.50:5173', 'http://10.0.0.7', 'http://172.16.4.2:8080',
    ]) expect(isAllowedOrigin(origin, none)).toBe(true);
  });

  it('allows a development tunnel, which is how a phone reaches the app', () => {
    // A phone cannot use its camera over plain HTTP, so enrollment testing
    // needs a public HTTPS name, and the subdomain changes every restart.
    for (const origin of [
      'https://truffle-reflex-early.ngrok-free.dev',
      'https://abc-123.ngrok-free.app',
      'https://something.trycloudflare.com',
    ]) expect(isAllowedOrigin(origin, none)).toBe(true);
  });

  it('refuses tunnels in production', () => {
    expect(isAllowedOrigin('https://truffle-reflex-early.ngrok-free.dev', none, true)).toBe(false);
    // ...but an explicitly configured origin still works there.
    expect(isAllowedOrigin('https://stmc.example.com',
      parseFrontendOrigins('https://stmc.example.com'), true)).toBe(true);
  });

  it('refuses anything else', () => {
    for (const origin of [
      'https://evil.com', 'http://192.168.1.50.evil.com',
      'https://ngrok-free.dev.evil.com', 'http://notlocalhost',
    ]) expect(isAllowedOrigin(origin, none)).toBe(false);
  });

  it('does not let a lookalike host pass as a tunnel', () => {
    expect(isAllowedOrigin('https://x.ngrok-free.dev.attacker.net', none)).toBe(false);
    expect(isAllowedOrigin('http://x.ngrok-free.dev', none)).toBe(false);   // http, not https
  });
});

describe('link-local addresses', () => {
  it('allows 169.254.x.x, which Windows assigns without DHCP', () => {
    // The dashboard gets opened on exactly this while testing; blocking it
    // refused the realtime event stream, which then retried forever.
    expect(isAllowedOrigin('http://169.254.25.98:5174', new Set())).toBe(true);
    expect(isAllowedOrigin('http://169.254.1.1:3000', new Set())).toBe(true);
  });

  it('still rejects a public address that merely looks similar', () => {
    expect(isAllowedOrigin('http://169.25.4.98:5174', new Set())).toBe(false);
    expect(isAllowedOrigin('http://evil.com', new Set())).toBe(false);
  });
});

/**
 * Builds an RTSP URL from DVR connection details, so an operator enters an IP,
 * a channel and credentials instead of hand-writing a brand-specific path.
 *
 * The templates mirror `src/facerec/dvr.py` in the Python service, which is the
 * source of truth. `tests/test_dvr.py::test_backend_templates_match` fails if
 * the two ever drift apart — a wrong template produces a URL that simply never
 * connects, with nothing to point at the cause.
 *
 * Kept free of Nest DI so it can be unit tested: this code handles camera
 * passwords, so its escaping rules need to be pinned down by tests.
 */

/** Placeholders: {user} {pass} {host} {port} {ch} {sub} {sub1} {stream} */
export const RTSP_TEMPLATES: Record<string, string> = {
  // Hikvision / HiLook / Ezviz and many rebrands. Channel 1 main = 101, sub = 102.
  hikvision: 'rtsp://{user}:{pass}@{host}:{port}/Streaming/Channels/{ch}0{sub1}',
  // Dahua / Imou / Amcrest / Lorex and many rebrands.
  dahua: 'rtsp://{user}:{pass}@{host}:{port}/cam/realmonitor?channel={ch}&subtype={sub}',
  // Uniview / UNV.
  uniview: 'rtsp://{user}:{pass}@{host}:{port}/unicast/c{ch}/s{sub}/live',
  // XMeye / generic Chinese DVR boards.
  xmeye: 'rtsp://{user}:{pass}@{host}:{port}/user={user}&password={pass}&channel={ch}&stream={sub}.sdp?',
  // TVT (and its rebrands). RTSP server banner: "TVT RTSP Server".
  tvt: 'rtsp://{user}:{pass}@{host}:{port}/chID={ch}&streamType={stream}',
  // Anything else: the operator supplies urlTemplate.
  custom: '',
};

export const RTSP_BRANDS = Object.keys(RTSP_TEMPLATES);

export type RtspParts = {
  host: string;
  port?: number;
  username: string;
  password: string;
  brand: string;
  channel?: number;
  stream?: 'main' | 'sub';
  urlTemplate?: string;
};

export function buildRtspUrl(parts: RtspParts): string {
  const template = parts.brand === 'custom'
    ? (parts.urlTemplate ?? '').trim()
    : RTSP_TEMPLATES[parts.brand];
  if (!template) {
    throw new Error(parts.brand === 'custom'
      ? 'A custom URL template is required for brand "custom"'
      : `Unknown camera brand "${parts.brand}". Use one of: ${RTSP_BRANDS.join(', ')}`);
  }

  const sub = (parts.stream ?? 'sub') === 'main' ? 0 : 1;
  const values: Record<string, string> = {
    // Percent-encode so a password containing : / @ or ? cannot break the URL
    // apart or be misread as a host. Matches quote(safe="") in dvr.py.
    user: encodeURIComponent(parts.username),
    pass: encodeURIComponent(parts.password),
    host: parts.host.trim(),
    port: String(parts.port ?? 554),
    ch: String(parts.channel ?? 1),
    sub: String(sub),
    sub1: String(sub + 1),
    stream: sub === 0 ? 'main' : 'sub',
  };
  return template.replace(/\{(user|pass|host|port|ch|sub1|sub|stream)\}/g, (_, key) => values[key]);
}

/** The same URL with the password replaced, for logs and error messages. */
export function maskRtspUrl(url: string): string {
  return url.replace(/:\/\/([^:/@]+):[^@]*@/, '://$1:*****@');
}

/**
 * Read the credentials back out of a stored URL, undoing the percent-encoding
 * buildRtspUrl applied. Needed when an operator changes the channel or stream
 * of an existing camera: the password is only ever kept inside the encrypted
 * URL, so rebuilding without asking them to retype it means recovering it.
 */
export function credentialsFromUrl(url: string): { username: string; password: string } | null {
  // Match the LAST '@' before the host so a password containing an encoded
  // '@' cannot truncate the match.
  const found = /^rtsps?:\/\/([^:/@]+):([^@]*)@/i.exec(url);
  if (!found) return null;
  try {
    return { username: decodeURIComponent(found[1]), password: decodeURIComponent(found[2]) };
  } catch {
    return { username: found[1], password: found[2] };   // not percent-encoded
  }
}

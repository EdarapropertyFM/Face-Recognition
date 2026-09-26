import { buildRtspUrl, credentialsFromUrl, maskRtspUrl, RTSP_BRANDS } from './rtsp-url';

const base = { host: '192.168.1.64', username: 'admin', password: 'pass', brand: 'hikvision' };

describe('buildRtspUrl', () => {
  it('builds the Hikvision channel/stream suffix (ch1 sub = 102, ch2 main = 201)', () => {
    expect(buildRtspUrl({ ...base, channel: 1, stream: 'sub' }))
      .toBe('rtsp://admin:pass@192.168.1.64:554/Streaming/Channels/102');
    expect(buildRtspUrl({ ...base, channel: 2, stream: 'main' }))
      .toBe('rtsp://admin:pass@192.168.1.64:554/Streaming/Channels/201');
  });

  it('builds Dahua and Uniview paths', () => {
    expect(buildRtspUrl({ ...base, brand: 'dahua', channel: 3, stream: 'main' }))
      .toBe('rtsp://admin:pass@192.168.1.64:554/cam/realmonitor?channel=3&subtype=0');
    expect(buildRtspUrl({ ...base, brand: 'uniview', channel: 4, port: 8554 }))
      .toBe('rtsp://admin:pass@192.168.1.64:8554/unicast/c4/s1/live');
  });

  it('defaults to port 554, channel 1 and the sub stream', () => {
    expect(buildRtspUrl(base)).toBe('rtsp://admin:pass@192.168.1.64:554/Streaming/Channels/102');
  });

  it('percent-encodes credentials so punctuation cannot break the URL apart', () => {
    // A password with : / @ ? would otherwise be read as part of the host or path.
    const url = buildRtspUrl({ ...base, username: 'a@b', password: 'p@ss:w/rd?1' });
    expect(url).toBe('rtsp://a%40b:p%40ss%3Aw%2Frd%3F1@192.168.1.64:554/Streaming/Channels/102');
    expect(url.split('@').length - 1).toBe(1);        // exactly one credential separator
  });

  it('uses a custom template when the brand is custom', () => {
    expect(buildRtspUrl({
      ...base, brand: 'custom', channel: 7,
      urlTemplate: 'rtsp://{user}:{pass}@{host}:{port}/ch{ch}/{sub}',
    })).toBe('rtsp://admin:pass@192.168.1.64:554/ch7/1');
  });

  it('refuses an unknown brand, and custom without a template', () => {
    expect(() => buildRtspUrl({ ...base, brand: 'nope' })).toThrow(/Unknown camera brand/);
    expect(() => buildRtspUrl({ ...base, brand: 'custom' })).toThrow(/custom URL template is required/);
    expect(() => buildRtspUrl({ ...base, brand: 'custom', urlTemplate: '   ' }))
      .toThrow(/custom URL template is required/);
  });

  it('offers the brands the DVR page offers', () => {
    expect(RTSP_BRANDS).toEqual(['hikvision', 'dahua', 'uniview', 'xmeye', 'tvt', 'custom']);
  });
});

describe('maskRtspUrl', () => {
  it('hides the password but keeps the URL readable', () => {
    expect(maskRtspUrl('rtsp://admin:s3cret@10.0.0.5:554/Streaming/Channels/102'))
      .toBe('rtsp://admin:*****@10.0.0.5:554/Streaming/Channels/102');
  });

  it('leaves a URL without credentials alone', () => {
    expect(maskRtspUrl('rtsp://10.0.0.5:554/stream')).toBe('rtsp://10.0.0.5:554/stream');
  });
});

describe('credentialsFromUrl', () => {
  it('round-trips what buildRtspUrl encoded, so a channel change keeps the password', () => {
    const url = buildRtspUrl({ ...base, username: 'a@b', password: 'p@ss:w/rd?1' });
    expect(credentialsFromUrl(url)).toEqual({ username: 'a@b', password: 'p@ss:w/rd?1' });
  });

  it('reads plain credentials', () => {
    expect(credentialsFromUrl('rtsp://admin:s3cret@10.0.0.5:554/x'))
      .toEqual({ username: 'admin', password: 's3cret' });
  });

  it('returns null when the URL carries no credentials', () => {
    expect(credentialsFromUrl('rtsp://10.0.0.5:554/stream')).toBeNull();
    expect(credentialsFromUrl('not a url')).toBeNull();
  });

  it('handles an empty password', () => {
    expect(credentialsFromUrl('rtsp://admin:@10.0.0.5:554/x'))
      .toEqual({ username: 'admin', password: '' });
  });
});

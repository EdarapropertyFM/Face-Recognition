import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Expand, HardDrive, LoaderCircle, Monitor, Radio, RefreshCw, RotateCw, VideoOff } from 'lucide-react';
import { ZONES } from '../store';
import { apiFetch, streamUrl as streamEndpoint } from '../api';
import { useRealtime } from '../hooks/useRealtime';
import { useOnScreen, usePageVisible, useStreamSlot } from '../hooks/useStreamSlot';
import { zoneLabel } from '../utils/display';
import { nextAngle } from '../utils/cameraRotation';

// A 1x1 transparent GIF. Pointing an <img> at this is how you make the
// browser let go of an MJPEG stream (see the teardown effect below).
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function CameraFeed({ camera, lang, refreshKey }) {
  const [streamUrl, setStreamUrl] = useState('');
  const [state, setState] = useState(camera.rtspConfigured ? 'connecting' : 'unconfigured');
  const location = camera.location || zoneLabel(camera.zone, lang);
  const tileRef = useRef(null);
  const onScreen = useOnScreen(tileRef);
  const [failed, setFailed] = useState(false);
  // How a camera is mounted is a fact about the camera, not a preference of
  // whoever is looking, so the angle lives on the camera record and the AI
  // applies it before recognition runs. Mirrored in state so the tile reacts
  // immediately instead of waiting for the camera list to reload.
  const [rotation, setRotation] = useState(camera.rotation ?? 0);
  useEffect(() => { setRotation(camera.rotation ?? 0); }, [camera.rotation]);
  // Mirrors streamUrl for the effect below, which must read it without
  // depending on it.
  const streamUrlRef = useRef('');
  streamUrlRef.current = streamUrl;
  // Guards against two overlapping token requests for the same tile.
  const inFlightRef = useRef(false);
  const imgRef = useRef(null);
  const streamable = camera.rtspConfigured && camera.enabled !== false;
  // Only on-screen tiles hold a connection, and only a few at a time. A tile
  // that failed stops asking for one: an unreachable camera would otherwise
  // hold its slot for good and the queued tiles behind it would never load.
  const visible = usePageVisible();
  const slot = useStreamSlot(streamable && onScreen && visible && !failed);

  const requestStream = useCallback(async () => {
    if (!camera.rtspConfigured || camera.enabled === false) {
      setState(camera.enabled === false ? 'disabled' : 'unconfigured'); setStreamUrl(''); return;
    }
    // One token request at a time.
    //
    // The token is fetched asynchronously, so two calls that arrive before
    // the first resolves both proceed, and the second <img> src replaces the
    // first while its connection is still being established - orphaning it.
    // React StrictMode guarantees exactly that on every mount in
    // development by running each effect twice.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setState('connecting');
    try {
      const response = await apiFetch(`/cameras/${camera.id}/stream-token`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Playback authorization failed');
      setStreamUrl(streamEndpoint(`/cameras/stream/${encodeURIComponent(data.playbackId)}?token=${encodeURIComponent(data.token)}`));
    } catch { setState('error'); setFailed(true); setStreamUrl(''); }
    finally { inFlightRef.current = false; }
  }, [camera.enabled, camera.id, camera.rtspConfigured]);

  // Losing the slot does not drop the picture straight away.
  //
  // A tile loses and regains its slot constantly, and most of those are
  // instant round trips that the viewer should never see: React StrictMode
  // mounts every effect twice in development (run, clean up, run again), the
  // IntersectionObserver flickers while scrolling, and a re-render can
  // reshuffle slots. Tearing the stream down on each one asked the AI for a
  // new playback token and a new connection, leaving the previous one
  // orphaned - which is why the log showed three simultaneous requests for
  // the same channel, and why tiles flickered between Connecting and live.
  //
  // Holding the picture for a moment absorbs every one of those. A tile that
  // is genuinely gone releases after the grace period and costs nothing,
  // because the AI keeps the RTSP connection warm for far longer than this.
  const RELEASE_GRACE_MS = 2500;

  useEffect(() => {
    if (!slot) {
      const timer = window.setTimeout(() => {
        setStreamUrl('');
        if (streamable && !failed) setState('queued');
      }, RELEASE_GRACE_MS);
      return () => window.clearTimeout(timer);
    }
    // Asked for once, when the tile starts streaming, and never renewed.
    //
    // This used to re-request a token every 4 minutes. The playback token is
    // only checked when the stream request is made, so renewing it bought
    // nothing - but it replaced the <img> src, which tore down a healthy
    // stream and reopened the RTSP connection from scratch. Every camera
    // dropped to "Connecting..." on a 4-minute cycle. A stream that genuinely
    // fails is handled by the error path, which fetches a fresh token on retry.
    //
    // Already streaming means this is a slot regained within the grace above:
    // the picture never stopped, so asking for another connection would undo
    // the point of the grace.
    if (streamUrlRef.current) return undefined;
    // oxlint-disable-next-line react/set-state-in-effect -- synchronize playback authorization
    requestStream();
    return undefined;
  }, [requestStream, refreshKey, slot, streamable, failed]);

  // Hand the connection back when the tile goes away.
  //
  // An MJPEG response never ends, and Chrome does NOT close one just because
  // its <img> was removed from the DOM - the socket stays open, showing as a
  // request stuck on "(pending)" forever. Leaving Live Wall therefore leaked
  // one connection per camera, every visit, until the browser hit its
  // per-origin limit and the page could not load anything at all.
  //
  // Pointing the element at a blank image is what actually makes the browser
  // abandon the stream, so it is done explicitly here and whenever streamUrl
  // is cleared (the element is always rendered, never conditionally, so there
  // is something to point).
  //
  // The element is captured at mount, NOT read from the ref inside the
  // cleanup: React detaches refs while deleting a component, so by the time
  // an unmount cleanup runs, imgRef.current is already null and the teardown
  // silently did nothing. That is why connections kept accumulating even
  // after this effect was added.
  useEffect(() => {
    const element = imgRef.current;
    return () => { if (element) element.src = BLANK_IMAGE; };
  }, []);

  // A refresh from the toolbar gives every failed tile another chance.
  useEffect(() => { if (refreshKey) setFailed(false); }, [refreshKey]);

  const retry = useCallback(() => { setFailed(false); setState('connecting'); }, []);

  const fullscreen = (event) => {
    event.stopPropagation();
    event.currentTarget.closest('.cam')?.requestFullscreen?.();
  };

  const rotate = async (event) => {
    event.stopPropagation();
    const next = nextAngle(rotation);
    setRotation(next);
    try {
      const response = await apiFetch(`/cameras/${camera.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotation: next }),
      });
      if (!response.ok) throw new Error('rejected');
      // The AI turns the frames themselves, so the stream must be reopened
      // for the new angle to take effect.
      setStreamUrl('');
      requestStream();
    } catch {
      setRotation(rotation);          // put it back; the camera did not change
    }
  };

  return <div className="cam real-feed" ref={tileRef}>
    <div className="feed">
      {/* Always rendered: removing it would strand the open MJPEG connection,
          so the stream is stopped by swapping src to a blank image instead. */}
      <img ref={imgRef} src={streamUrl || BLANK_IMAGE}
        alt={streamUrl ? `${camera.displayName || camera.id} live stream` : ''}
        style={streamUrl ? undefined : { display: 'none' }}
        onLoad={() => { if (streamUrl) setState('live'); }}
        onError={() => { if (streamUrl) { setState('error'); setFailed(true); } }} />
      {state !== 'live' && <div className="feed-state">
        {state === 'connecting' ? <LoaderCircle size={28} className="feed-spinner" /> : <VideoOff size={30} />}
        <b>{state === 'connecting' ? (lang ? 'جاري الاتصال…' : 'Connecting…')
          : state === 'queued' ? (lang ? 'في الانتظار…' : 'Waiting for a free connection…')
          : state === 'unconfigured' ? (lang ? 'مصدر RTSP غير مُعد' : 'RTSP source not configured')
          : state === 'disabled' ? (lang ? 'الكاميرا متوقفة' : 'Camera disabled')
          : (lang ? 'تعذر فتح البث' : 'Stream unavailable')}</b>
        {state === 'error' && <button className="btn ghost sm" onClick={retry}><RefreshCw size={13} /> Retry</button>}
      </div>}
    </div>
    <div className="lbl"><Radio size={12} /> {camera.displayName || camera.id} · {location}</div>
    <div className={`live ${state === 'live' ? '' : 'offline-live'}`}><b />{state === 'live' ? 'LIVE AI' : state.toUpperCase()}</div>
    {state === 'live' && <div className="feed-tools">
      <button className="feed-tool" onClick={rotate}
        title={lang ? `تدوير الصورة (${rotation}°)` : `Rotate view (${rotation}°)`}
        aria-label={lang ? 'تدوير الصورة' : 'Rotate view'}>
        <RotateCw size={15} />
      </button>
      <button className="feed-tool" onClick={fullscreen}
        title={lang ? 'ملء الشاشة' : 'Fullscreen'} aria-label={lang ? 'ملء الشاشة' : 'Fullscreen'}>
        <Expand size={15} />
      </button>
    </div>}
  </div>;
}

export default function LiveWallPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [zoneFilter, setZoneFilter] = useState(-1);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [collapsed, setCollapsed] = useState({});

  const loadCameras = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/cameras');
      if (!response.ok) throw new Error('Could not load cameras');
      setCameras(await response.json()); setError('');
    } catch (loadError) { setError(loadError.message); setCameras([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- initial API synchronization
    loadCameras();
  }, [loadCameras]);
  useRealtime((event) => {
    if (event.type.startsWith('camera.')) loadCameras();
  });

  const visible = useMemo(() => cameras.filter((camera) => zoneFilter < 0 || camera.zone === zoneFilter), [cameras, zoneFilter]);
  const configured = cameras.filter((camera) => camera.rtspConfigured && camera.enabled !== false).length;

  // A recorder is one device with many feeds. Grouping its channels under a
  // single heading keeps eight tiles from reading as eight unrelated cameras,
  // and lets an operator collapse a recorder they are not watching.
  const groups = useMemo(() => {
    const byHost = new Map();
    for (const camera of visible) {
      const key = camera.host || '__standalone__';
      if (!byHost.has(key)) byHost.set(key, []);
      byHost.get(key).push(camera);
    }
    return [...byHost.entries()]
      .map(([host, list]) => ({
        host,
        isDvr: host !== '__standalone__' && list.length > 1,
        cameras: [...list].sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0) || a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => Number(b.isDvr) - Number(a.isDvr) || a.host.localeCompare(b.host));
  }, [visible]);

  const toggleGroup = (host) => setCollapsed((current) => ({ ...current, [host]: !current[host] }));

  return <>
    <div className="ph"><div><h1>{t('nav.livewall')}</h1><div className="sub">{configured} / {cameras.length} {lang ? 'مصدر بث مُعد' : 'streams configured'}</div></div><div className="grow" /><div className="chips"><span className="chip"><i style={{ color: 'var(--green)' }}>●</i> {t('face.known')}</span><span className="chip"><i style={{ color: 'var(--amber)' }}>●</i> {t('face.unknown')}</span></div></div>
    <div className="toolbar" style={{ marginBottom: 16 }}><Monitor size={16} style={{ color: 'var(--muted)' }} /><select value={zoneFilter} onChange={(event) => setZoneFilter(Number(event.target.value))}><option value={-1}>{lang ? 'كل المناطق' : 'All Zones'}</option>{ZONES.map((zone, index) => <option key={zone[0]} value={index}>{zone[lang]}</option>)}</select><button className="btn ghost sm" onClick={() => { loadCameras(); setRefreshKey((value) => value + 1); }}><RefreshCw size={13} /> {lang ? 'تحديث البث' : 'Refresh streams'}</button></div>
    {error && <div className="note" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{error}</div>}
    {loading ? <div className="note"><LoaderCircle size={15} /> {lang ? 'جاري تحميل الكاميرات…' : 'Loading cameras…'}</div> : groups.map((group) => {
      const online = group.cameras.filter((camera) => camera.rtspConfigured && camera.enabled !== false).length;
      const shut = collapsed[group.host];
      return <section className="wall-group" key={group.host}>
        {group.isDvr && <button type="button" className="wall-group-head" onClick={() => toggleGroup(group.host)} aria-expanded={!shut}>
          {shut ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <HardDrive size={15} />
          <b>{group.cameras[0].displayName?.replace(/\s*CH\d+$/, '') || group.host}</b>
          <span className="wall-group-meta">{group.host} · {group.cameras.length} {lang ? 'قناة' : 'channels'} · {online} {lang ? 'مُعد' : 'configured'}</span>
        </button>}
        {!shut && <div className="wall">{group.cameras.map((camera) => <CameraFeed key={camera.id} camera={camera} lang={lang} refreshKey={refreshKey} />)}</div>}
      </section>;
    })}
    {!loading && !visible.length && <div className="note">{lang ? 'لا توجد كاميرات في هذه المنطقة.' : 'No cameras in this zone.'}</div>}
    <div className="note" style={{ marginTop: 16 }}>{lang ? 'البث يعرض نتائج التعرف على الوجوه المرسومة مباشرة بواسطة نموذج STMC AI. روابط RTSP وبيانات الدخول لا تصل إلى المتصفح.' : 'The stream shows face-recognition overlays generated live by STMC AI. RTSP URLs and credentials never reach the browser.'}</div>
  </>;
}

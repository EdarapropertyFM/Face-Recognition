import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Expand, LoaderCircle, Monitor, Radio, RefreshCw, VideoOff } from 'lucide-react';
import { ZONES } from '../store';
import { apiFetch, apiUrl } from '../api';
import { useRealtime } from '../hooks/useRealtime';

function CameraFeed({ camera, lang, refreshKey }) {
  const [streamUrl, setStreamUrl] = useState('');
  const [state, setState] = useState(camera.rtspConfigured ? 'connecting' : 'unconfigured');
  const location = camera.location || ZONES[camera.zone]?.[lang] || `Zone ${camera.zone}`;

  const requestStream = useCallback(async () => {
    if (!camera.rtspConfigured || camera.enabled === false) {
      setState(camera.enabled === false ? 'disabled' : 'unconfigured'); setStreamUrl(''); return;
    }
    setState('connecting');
    try {
      const response = await apiFetch(`/cameras/${camera.id}/stream-token`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Playback authorization failed');
      setStreamUrl(apiUrl(`/cameras/stream/${encodeURIComponent(data.playbackId)}?token=${encodeURIComponent(data.token)}`));
    } catch { setState('error'); setStreamUrl(''); }
  }, [camera.enabled, camera.id, camera.rtspConfigured]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- synchronize playback authorization
    requestStream();
    const renewal = window.setInterval(requestStream, 4 * 60 * 1000);
    return () => window.clearInterval(renewal);
  }, [requestStream, refreshKey]);

  const fullscreen = (event) => {
    event.stopPropagation();
    event.currentTarget.closest('.cam')?.requestFullscreen?.();
  };

  return <div className="cam real-feed">
    <div className="feed">
      {streamUrl && <img src={streamUrl} alt={`${camera.displayName || camera.id} live stream`} onLoad={() => setState('live')} onError={() => setState('error')} />}
      {state !== 'live' && <div className="feed-state">
        {state === 'connecting' ? <LoaderCircle size={28} className="feed-spinner" /> : <VideoOff size={30} />}
        <b>{state === 'connecting' ? (lang ? 'جاري الاتصال…' : 'Connecting…') : state === 'unconfigured' ? (lang ? 'مصدر RTSP غير مُعد' : 'RTSP source not configured') : state === 'disabled' ? (lang ? 'الكاميرا متوقفة' : 'Camera disabled') : (lang ? 'تعذر فتح البث' : 'Stream unavailable')}</b>
        {state === 'error' && <button className="btn ghost sm" onClick={requestStream}><RefreshCw size={13} /> Retry</button>}
      </div>}
    </div>
    <div className="lbl"><Radio size={12} /> {camera.displayName || camera.id} · {location}</div>
    <div className={`live ${state === 'live' ? '' : 'offline-live'}`}><b />{state === 'live' ? 'LIVE AI' : state.toUpperCase()}</div>
    {state === 'live' && <button className="feed-expand" title="Fullscreen" onClick={fullscreen}><Expand size={16} /></button>}
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

  return <>
    <div className="ph"><div><h1>{t('nav.livewall')}</h1><div className="sub">{configured} / {cameras.length} {lang ? 'مصدر بث مُعد' : 'streams configured'}</div></div><div className="grow" /><div className="chips"><span className="chip"><i style={{ color: 'var(--green)' }}>●</i> {t('face.known')}</span><span className="chip"><i style={{ color: 'var(--amber)' }}>●</i> {t('face.unknown')}</span><span className="chip"><i style={{ color: 'var(--red)' }}>●</i> {t('face.watch')}</span></div></div>
    <div className="toolbar" style={{ marginBottom: 16 }}><Monitor size={16} style={{ color: 'var(--muted)' }} /><select value={zoneFilter} onChange={(event) => setZoneFilter(Number(event.target.value))}><option value={-1}>{lang ? 'كل المناطق' : 'All Zones'}</option>{ZONES.map((zone, index) => <option key={zone[0]} value={index}>{zone[lang]}</option>)}</select><button className="btn ghost sm" onClick={() => { loadCameras(); setRefreshKey((value) => value + 1); }}><RefreshCw size={13} /> {lang ? 'تحديث البث' : 'Refresh streams'}</button></div>
    {error && <div className="note" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{error}</div>}
    {loading ? <div className="note"><LoaderCircle size={15} /> {lang ? 'جاري تحميل الكاميرات…' : 'Loading cameras…'}</div> : <div className="wall">{visible.map((camera) => <CameraFeed key={camera.id} camera={camera} lang={lang} refreshKey={refreshKey} />)}</div>}
    {!loading && !visible.length && <div className="note">{lang ? 'لا توجد كاميرات في هذه المنطقة.' : 'No cameras in this zone.'}</div>}
    <div className="note" style={{ marginTop: 16 }}>{lang ? 'البث يعرض نتائج التعرف على الوجوه المرسومة مباشرة بواسطة نموذج STMC AI. روابط RTSP وبيانات الدخول لا تصل إلى المتصفح.' : 'The stream shows face-recognition overlays generated live by STMC AI. RTSP URLs and credentials never reach the browser.'}</div>
  </>;
}

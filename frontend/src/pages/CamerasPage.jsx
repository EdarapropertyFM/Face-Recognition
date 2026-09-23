import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Camera, CirclePlus, Cpu, Hash, List, LoaderCircle, MapPin, MapPinned, PlugZap, Power, Settings, ShieldCheck, Trash2, Video, Wifi, WifiOff, X } from 'lucide-react';
import { ZONES } from '../store';
import { apiFetch } from '../api';
import { useAuth } from '../context/useAuth';

const EMPTY_FORM = { id: '', displayName: '', buildingCode: '', zone: 0, location: '', rtspUrl: '', codec: 'unknown', enabled: true };

export default function CamerasPage() {
  const { t, i18n } = useTranslation();
  const { canEdit } = useAuth();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [zoneFilter, setZoneFilter] = useState(-1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadCameras = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/cameras');
      if (!response.ok) throw new Error('Could not load cameras');
      setCameras(await response.json()); setLoadError('');
    } catch (error) { setLoadError(error.message); setCameras([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- initial API synchronization
    loadCameras();
  }, [loadCameras]);

  const openCreate = () => { setEditing('new'); setForm(EMPTY_FORM); setFeedback(null); };
  const openEdit = (camera) => {
    setEditing(camera.id);
    setForm({ id: camera.id, displayName: camera.displayName || camera.id, buildingCode: camera.buildingCode || '', zone: camera.zone, location: camera.location || '', rtspUrl: '', codec: camera.codec || 'unknown', enabled: camera.enabled !== false });
    setFeedback(null);
  };
  const zoneName = (camera) => camera.location || ZONES[camera.zone]?.[lang] || `Zone ${camera.zone}`;
  const onlineTotal = cameras.filter((camera) => camera.status === 'online').length;
  const filtered = useMemo(() => cameras.filter((camera) =>
    (zoneFilter < 0 || camera.zone === zoneFilter) && (statusFilter === 'all' || camera.status === statusFilter) &&
    `${camera.id} ${camera.displayName || ''} ${camera.location || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [cameras, search, statusFilter, zoneFilter]);
  const byZone = ZONES.map((zone, index) => ({ name: zone[lang], online: cameras.filter((camera) => camera.zone === index && camera.status === 'online').length, offline: cameras.filter((camera) => camera.zone === index && camera.status !== 'online').length }));

  const saveCamera = async (event) => {
    event.preventDefault(); setSaving(true); setFeedback(null);
    const isNew = editing === 'new';
    const payload = { ...form, zone: Number(form.zone) };
    if (!isNew && !payload.rtspUrl) delete payload.rtspUrl;
    try {
      const response = await apiFetch(isNew ? '/cameras' : `/cameras/${editing}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Could not save camera');
      await loadCameras(); setEditing(null);
    } catch (error) { setFeedback({ ok: false, text: error.message }); }
    finally { setSaving(false); }
  };

  const testCamera = async () => {
    setSaving(true); setFeedback({ ok: true, text: lang ? 'جاري اختبار البث…' : 'Testing stream…' });
    try {
      const response = await apiFetch(`/cameras/${editing}/test`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Connection test failed');
      setFeedback({ ok: data.ok, text: data.ok ? `Connected · ${data.width}×${data.height} · ${data.fps || 0} FPS` : data.error });
      await loadCameras();
    } catch (error) { setFeedback({ ok: false, text: error.message }); }
    finally { setSaving(false); }
  };

  const deleteCamera = async () => {
    if (!window.confirm(lang ? 'حذف هذه الكاميرا؟' : 'Delete this camera?')) return;
    const response = await apiFetch(`/cameras/${editing}`, { method: 'DELETE' });
    if (response.ok) { setEditing(null); await loadCameras(); }
  };

  return <>
    <div className="ph cameras-page-header"><div><h1>{t('nav.cameras')}</h1><div className="sub">{onlineTotal} {t('common.online')} · {cameras.length - onlineTotal} offline (of {cameras.length})</div></div><div className="grow" />{canEdit('cameras') && <button className="btn camera-add-button" onClick={openCreate}><span className="camera-add-icon"><CirclePlus size={18} /></span><span>{lang ? 'إضافة كاميرا' : 'Add camera'}<small>{lang ? 'إعداد مصدر بث جديد' : 'Configure a new stream'}</small></span></button>}</div>
    {loadError && <div className="note" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{loadError}</div>}
    <div className="kpis">{[[Video, 'Total Cameras', cameras.length, 'System-wide', 'blue'], [Wifi, 'Online', onlineTotal, 'Active feeds', 'green'], [WifiOff, 'Offline', cameras.length - onlineTotal, 'Needs attention', 'red'], [MapPin, 'Zones', new Set(cameras.map((camera) => camera.zone)).size, 'Monitored areas', 'amber']].map(([Icon, label, value, note, color]) => <div className="kpi-card glass-panel" key={label}><div className="kpi-header"><span className={`kpi-icon ${color}`}><Icon size={18} /></span><div className="lab">{label}</div></div><div className="kpi-body"><div className="val a">{value}</div><div className="tr">{note}</div></div></div>)}</div>
    <div className="two">
      <div className="panel glass-panel"><h3><MapPin size={18} color="var(--accent)" /> {lang ? 'حسب الموقع' : 'By location'}</h3><table><thead><tr><th>{lang ? 'المنطقة' : 'Zone'}</th><th>Online</th><th>Offline</th></tr></thead><tbody>{byZone.map((zone) => <tr key={zone.name}><td>{zone.name}</td><td>{zone.online}</td><td>{zone.offline || '—'}</td></tr>)}</tbody></table></div>
      <div className="panel glass-panel"><h3><List size={18} color="var(--green)" /> {lang ? 'قائمة الكاميرات' : 'Camera list'}</h3><div className="toolbar"><div className="search"><input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={(event) => setSearch(event.target.value)} /></div><select value={zoneFilter} onChange={(event) => setZoneFilter(Number(event.target.value))}><option value={-1}>All zones</option>{ZONES.map((zone, index) => <option value={index} key={zone[0]}>{zone[lang]}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All</option><option value="online">Online</option><option value="offline">Offline</option></select></div>
        {loading ? <div className="note"><LoaderCircle size={14} /> Loading cameras…</div> : <div style={{ maxHeight: 410, overflowY: 'auto' }}><table><thead><tr><th>Camera</th><th>Location</th><th>Status</th><th>Source</th><th /></tr></thead><tbody>{filtered.map((camera) => <tr key={camera.id}><td><b>{camera.displayName || camera.id}</b><div className="mono">{camera.id}</div></td><td>{zoneName(camera)}</td><td><span className={`tag ${camera.status}`}>{camera.status}</span>{camera.lastError && <div style={{ color: 'var(--red)', fontSize: 10, marginTop: 4 }}>{camera.lastError}</div>}</td><td><span className={`tag ${camera.rtspConfigured ? 'closed' : 'unknown'}`}>{camera.rtspConfigured ? `${camera.codec} · configured` : 'not configured'}</span></td><td>{canEdit('cameras') && <button className="btn ghost sm" onClick={() => openEdit(camera)} title="Configure"><Settings size={14} /></button>}</td></tr>)}</tbody></table>{!filtered.length && <div className="note">{lang ? 'لا توجد كاميرات مطابقة.' : 'No matching cameras.'}</div>}</div>}
      </div>
    </div>
    {editing && <div className="overlay camera-overlay" onClick={(event) => event.target === event.currentTarget && setEditing(null)}><form className="modal camera-modal" onSubmit={saveCamera}>
      <div className="mh camera-modal-header"><span className="camera-modal-icon"><Camera size={22} /></span><div><h3>{editing === 'new' ? (lang ? 'إضافة كاميرا جديدة' : 'Add new camera') : (lang ? 'إعداد الكاميرا' : 'Configure camera')}</h3><p>{lang ? 'أدخل بيانات الموقع ومصدر البث الآمن' : 'Set the location and secure video source'}</p></div><button type="button" className="camera-close" onClick={() => setEditing(null)} aria-label="Close"><X size={18} /></button></div>
      <div className="mb camera-modal-body">
        <div className="camera-form-section"><div className="camera-section-title"><MapPinned size={15} /><span>{lang ? 'هوية وموقع الكاميرا' : 'Camera identity & location'}</span></div>
          <div className="frow"><div className="fg"><label><Hash size={13} /> Camera ID</label><input type="text" required disabled={editing !== 'new'} value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} placeholder="CAM-01" /></div><div className="fg"><label><Camera size={13} /> Display name</label><input type="text" required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Main gate" /></div></div>
          <div className="frow"><div className="fg"><label><Building2 size={13} /> Building</label><input type="text" value={form.buildingCode} onChange={(event) => setForm({ ...form, buildingCode: event.target.value })} placeholder="WTR-B1" /></div><div className="fg"><label><MapPin size={13} /> Zone</label><select value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })}>{ZONES.map((zone, index) => <option value={index} key={zone[0]}>{zone[lang]}</option>)}</select></div></div>
          <div className="fg camera-last-field"><label><MapPinned size={13} /> Exact location</label><input type="text" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Lobby north entrance" /></div>
        </div>
        <div className="camera-form-section"><div className="camera-section-title"><Video size={15} /><span>{lang ? 'إعدادات البث' : 'Stream configuration'}</span></div>
          <div className="fg"><label><Wifi size={13} /> RTSP URL {editing !== 'new' && <em>({lang ? 'اتركه فارغًا للاحتفاظ بالحالي' : 'leave blank to keep current'})</em>}</label><input required={editing === 'new'} type="password" autoComplete="new-password" value={form.rtspUrl} onChange={(event) => setForm({ ...form, rtspUrl: event.target.value })} placeholder="rtsp://user:password@192.168.1.50:554/stream" /><div className="camera-security-hint"><ShieldCheck size={15} /><span>{lang ? 'يتم تشفير بيانات الدخول ولا يتم إرسالها للمتصفح.' : 'Credentials are encrypted and never returned to the browser.'}</span></div></div>
          <div className="frow camera-last-row"><div className="fg"><label><Cpu size={13} /> Codec</label><select value={form.codec} onChange={(event) => setForm({ ...form, codec: event.target.value })}><option value="unknown">Auto / unknown</option><option value="h264">H.264</option><option value="h265">H.265</option></select></div><div className="fg"><label><Power size={13} /> State</label><select value={String(form.enabled)} onChange={(event) => setForm({ ...form, enabled: event.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></div></div>
        </div>
        {feedback && <div className={`camera-feedback ${feedback.ok ? 'success' : 'error'}`}>{feedback.text}</div>}
      </div>
      <div className="mf camera-modal-footer">{editing !== 'new' && <button type="button" className="btn camera-delete-button" onClick={deleteCamera}><Trash2 size={14} /> {lang ? 'حذف' : 'Delete'}</button>}<div className="grow" />{editing !== 'new' && <button type="button" className="btn ghost camera-test-button" disabled={saving || (!form.rtspUrl && !cameras.find((camera) => camera.id === editing)?.rtspConfigured)} onClick={testCamera}><PlugZap size={14} /> {lang ? 'اختبار الاتصال' : 'Test connection'}</button>}<button className="btn camera-save-button" disabled={saving}>{saving ? (lang ? 'جاري الحفظ…' : 'Saving…') : (lang ? 'حفظ الكاميرا' : 'Save camera')}</button></div>
    </form></div>}
  </>;
}

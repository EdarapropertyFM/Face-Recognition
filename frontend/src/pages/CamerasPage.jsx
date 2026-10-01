import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Camera, CirclePlus, Cpu, Hash, Layers, List, LoaderCircle, MapPin, MapPinned, PlugZap, Power, Settings, ShieldCheck, Trash2, Video, Wifi, WifiOff, X } from 'lucide-react';
import { ZONES } from '../store';
import { apiFetch } from '../api';
import { useAuth } from '../context/useAuth';

const BRANDS = ['hikvision', 'dahua', 'uniview', 'xmeye', 'tvt', 'custom'];

const EMPTY_FORM = {
  id: '', displayName: '', project: '', buildingCode: '', zone: 0, location: '',
  // 'dvr-all' adds every channel of a recorder at once (the usual case, and
  // the default); 'dvr' adds a single channel; 'url' takes a hand-written
  // RTSP URL for a camera that is not a known brand.
  sourceMode: 'dvr-all',
  host: '', port: 554, username: 'admin', password: '',
  brand: 'hikvision', channel: 1, stream: 'sub', urlTemplate: '',
  rtspUrl: '', codec: 'unknown', enabled: true,
  // Used only by "Import all channels": how many feeds the recorder has.
  channels: 4,
};

export default function CamerasPage() {
  const { t, i18n } = useTranslation();
  const { canEdit } = useAuth();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('');
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
    setForm({
      ...EMPTY_FORM,
      id: camera.id, displayName: camera.displayName || camera.id,
      project: camera.project || '', buildingCode: camera.buildingCode || '',
      zone: camera.zone, location: camera.location || '',
      // A camera saved from a hand-written URL has no stored host.
      sourceMode: camera.host ? 'dvr' : 'url',
      host: camera.host || '', port: camera.port || 554, username: camera.username || 'admin',
      password: '',                       // never returned by the API; blank keeps the current one
      brand: camera.brand || 'hikvision', channel: camera.channel || 1,
      stream: camera.stream || 'sub',
      codec: camera.codec || 'unknown', enabled: camera.enabled !== false,
    });
    setFeedback(null);
  };
  // Both DVR modes share the same connection fields; only the channel field
  // and the submit action differ.
  const isDvrMode = form.sourceMode === 'dvr-all' || form.sourceMode === 'dvr';
  const importingWholeDvr = form.sourceMode === 'dvr-all';

  /** Cameras with no building yet still have to be counted somewhere. */
  const UNPLACED = useMemo(() => (lang ? 'بدون مبنى' : 'No building'), [lang]);
  // 'health' is the stored status aged against its last check: a camera
  // tested days ago is 'unknown', not 'online'. Counting the stored status
  // instead reported feeds as live while the DVR was unplugged.
  const health = (camera) => camera.health ?? camera.status;
  const onlineTotal = cameras.filter((camera) => health(camera) === 'online').length;
  // Project and building, not zone: every other screen groups by building,
  // and a zone number means nothing to whoever is looking at this one.
  const projectOptions = useMemo(
    () => [...new Set(cameras.map((camera) => camera.project).filter(Boolean))].sort(), [cameras]);
  const buildingOptions = useMemo(() => [...new Set(cameras
    .filter((camera) => !projectFilter || camera.project === projectFilter)
    .map((camera) => camera.buildingCode).filter(Boolean))].sort(), [cameras, projectFilter]);

  const inScope = useCallback((camera) =>
    (!projectFilter || camera.project === projectFilter)
    && (!buildingFilter || camera.buildingCode === buildingFilter), [projectFilter, buildingFilter]);

  const filtered = useMemo(() => cameras.filter((camera) =>
    inScope(camera) && (statusFilter === 'all' || health(camera) === statusFilter) &&
    `${camera.id} ${camera.displayName || ''} ${camera.location || ''} ${camera.buildingCode || ''}`
      .toLowerCase().includes(search.toLowerCase())
  ), [cameras, search, statusFilter, inScope]);

  const byBuilding = useMemo(() => {
    const scoped = cameras.filter(inScope);
    const codes = [...new Set(scoped.map((camera) => camera.buildingCode || UNPLACED))].sort();
    return codes.map((code) => {
      const rows = scoped.filter((camera) => (camera.buildingCode || UNPLACED) === code);
      return {
        code,
        project: rows[0]?.project ?? null,
        online: rows.filter((camera) => health(camera) === 'online').length,
        total: rows.length,
      };
    }).sort((a, b) => b.total - a.total);
  }, [cameras, inScope, UNPLACED]);

  const saveCamera = async (event) => {
    event.preventDefault();
    // The primary button must do what the chosen source type says. Leaving
    // "import all channels" as a separate secondary button meant pressing
    // Save created a single channel and the other feeds never appeared.
    if (importingWholeDvr) return importDvr();
    setSaving(true); setFeedback(null);
    const isNew = editing === 'new';
    const { sourceMode, ...fields } = form;
    const payload = {
      id: fields.id, displayName: fields.displayName,
      project: fields.project, buildingCode: fields.buildingCode,
      zone: Number(fields.zone), location: fields.location,
      codec: fields.codec, enabled: fields.enabled,
    };
    if (sourceMode === 'dvr') {
      Object.assign(payload, {
        host: fields.host.trim(), port: Number(fields.port) || 554,
        username: fields.username.trim(), brand: fields.brand,
        channel: Number(fields.channel) || 1, stream: fields.stream,
      });
      // Blank password on an edit means "keep the stored one", so omit it
      // rather than sending an empty string the server would encrypt.
      if (fields.password) payload.password = fields.password;
      if (fields.brand === 'custom') payload.urlTemplate = fields.urlTemplate;
      if (isNew && !fields.password) {
        setSaving(false);
        setFeedback({ ok: false, text: lang ? 'كلمة المرور مطلوبة' : 'Password is required' });
        return;
      }
    } else if (fields.rtspUrl) {
      payload.rtspUrl = fields.rtspUrl;
    } else if (isNew) {
      setSaving(false);
      setFeedback({ ok: false, text: lang ? 'رابط RTSP مطلوب' : 'An RTSP URL is required' });
      return;
    }
    try {
      const response = await apiFetch(isNew ? '/cameras' : `/cameras/${editing}`, { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Could not save camera');
      await loadCameras(); setEditing(null);
    } catch (error) { setFeedback({ ok: false, text: error.message }); }
    finally { setSaving(false); }
  };

  // A DVR is one device with many feeds. Adding them one at a time is tedious
  // and easy to leave half-done, so this creates a camera per channel at once.
  const importDvr = async () => {
    setFeedback(null);
    if (!form.host.trim() || !form.password) {
      setFeedback({ ok: false, text: lang ? 'أدخل عنوان IP وكلمة المرور أولًا' : 'Enter the IP and password first' });
      return;
    }
    setSaving(true);
    setFeedback({ ok: true, text: lang ? 'جاري إضافة القنوات…' : 'Importing channels…' });
    try {
      const response = await apiFetch('/cameras/import-dvr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: form.host.trim(), port: Number(form.port) || 554,
          username: form.username.trim(), password: form.password, brand: form.brand,
          channels: Number(form.channels) || 1, stream: form.stream,
          urlTemplate: form.brand === 'custom' ? form.urlTemplate : undefined,
          idPrefix: (form.id || form.host).trim(), displayName: form.displayName || undefined,
          zone: Number(form.zone), project: form.project || undefined,
          buildingCode: form.buildingCode || undefined,
          location: form.location || undefined, probe: form.probeChannels === true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Import failed');
      await loadCameras();
      const skipped = data.skipped?.length ? ` · ${data.skipped.length} ${lang ? 'تم تخطيها' : 'skipped'}` : '';
      setFeedback({ ok: true, text: `${data.created.length} ${lang ? 'قناة أضيفت' : 'channel(s) added'}${skipped}` });
      if (data.created.length) setEditing(null);
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
    <div className="kpis">{[[Video, 'Total Cameras', cameras.length, 'System-wide', 'blue'], [Wifi, 'Online', onlineTotal, 'Active feeds', 'green'], [WifiOff, 'Offline', cameras.filter((camera) => health(camera) === 'offline').length, 'Confirmed down', 'red'], [Building2, 'Buildings', buildingOptions.length, 'With cameras', 'amber']].map(([Icon, label, value, note, color]) => <div className="kpi-card glass-panel" key={label}><div className="kpi-header"><span className={`kpi-icon ${color}`}><Icon size={18} /></span><div className="lab">{label}</div></div><div className="kpi-body"><div className="val a">{value}</div><div className="tr">{note}</div></div></div>)}</div>
    <div className="two">
      <div className="panel glass-panel">
        <h3><MapPin size={18} color="var(--accent)" /> {lang ? 'حسب الموقع' : 'By location'}</h3>

        <div className="cam-scope">
          <select value={projectFilter}
            onChange={(event) => { setProjectFilter(event.target.value); setBuildingFilter(''); }}>
            <option value="">{lang ? 'كل المشاريع' : 'All projects'}</option>
            {projectOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}>
            <option value="">{lang ? 'كل المباني' : 'All buildings'}</option>
            {buildingOptions.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>

        <table>
          <thead><tr>
            <th>{lang ? 'المبنى' : 'Building'}</th>
            <th>{lang ? 'المشروع' : 'Project'}</th>
            <th>{lang ? 'متصلة' : 'Online'}</th>
          </tr></thead>
          <tbody>
            {byBuilding.length ? byBuilding.map((row) => (
              <tr key={row.code}>
                <td><b>{row.code}</b></td>
                <td className="sub">{row.project || '—'}</td>
                <td>
                  <span className="cam-online">
                    <span className="cam-online-bar">
                      <span style={{ width: `${Math.round((row.online / row.total) * 100)}%`,
                        background: row.online === row.total ? 'var(--green)' : 'var(--red)' }} />
                    </span>
                    <span className="mono">{row.online}/{row.total}</span>
                  </span>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={3} className="sub" style={{ padding: 14 }}>
                {lang ? 'لا توجد كاميرات.' : 'No cameras here.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="panel glass-panel"><h3><List size={18} color="var(--green)" /> {lang ? 'قائمة الكاميرات' : 'Camera list'}</h3><div className="toolbar"><div className="search"><input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={(event) => setSearch(event.target.value)} /></div><select value={projectFilter} onChange={(event) => { setProjectFilter(event.target.value); setBuildingFilter(''); }}><option value="">{lang ? 'كل المشاريع' : 'All projects'}</option>{projectOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select><select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}><option value="">{lang ? 'كل المباني' : 'All buildings'}</option>{buildingOptions.map((code) => <option key={code} value={code}>{code}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">{lang ? 'كل الحالات' : 'All statuses'}</option><option value="online">{lang ? 'متصلة' : 'Online'}</option><option value="offline">{lang ? 'غير متصلة' : 'Offline'}</option></select></div>
        {loading ? <div className="note"><LoaderCircle size={14} /> Loading cameras…</div> : <div style={{ maxHeight: 410, overflowY: 'auto' }}><table><thead><tr><th>Camera</th><th>Location</th><th>Status</th><th>Source</th><th /></tr></thead><tbody>{filtered.map((camera) => <tr key={camera.id}><td><b>{camera.displayName || camera.id}</b>{camera.channel ? <div className="sub" style={{ fontSize: 11 }}>{lang ? 'قناة' : 'Channel'} {camera.channel}</div> : null}</td><td><b>{camera.buildingCode || UNPLACED}</b>{camera.location ? <div className="sub" style={{ fontSize: 11 }}>{camera.location}</div> : null}</td><td><span className={`tag ${health(camera) === 'unknown' ? 'unknown' : health(camera)}`}>{health(camera)}</span>{camera.statusStale && camera.status === 'online' && <div className="sub" style={{ fontSize: 10, marginTop: 4 }}>{lang ? 'لم يتم التحقق مؤخرًا — اضغط اختبار' : 'not verified recently — run Test'}</div>}{camera.lastError && <div style={{ color: 'var(--red)', fontSize: 10, marginTop: 4 }}>{camera.lastError}</div>}</td><td><span className={`tag ${camera.rtspConfigured ? 'closed' : 'unknown'}`}>{camera.rtspConfigured ? `${camera.codec} · configured` : 'not configured'}</span></td><td>{canEdit('cameras') && <button className="btn ghost sm" onClick={() => openEdit(camera)} title="Configure"><Settings size={14} /></button>}</td></tr>)}</tbody></table>{!filtered.length && <div className="note">{lang ? 'لا توجد كاميرات مطابقة.' : 'No matching cameras.'}</div>}</div>}
      </div>
    </div>
    {editing && <div className="overlay camera-overlay" onClick={(event) => event.target === event.currentTarget && setEditing(null)}><form className="modal camera-modal" onSubmit={saveCamera}>
      <div className="mh camera-modal-header"><span className="camera-modal-icon"><Camera size={22} /></span><div><h3>{editing === 'new' ? (lang ? 'إضافة كاميرا جديدة' : 'Add new camera') : (lang ? 'إعداد الكاميرا' : 'Configure camera')}</h3><p>{lang ? 'أدخل بيانات الموقع ومصدر البث الآمن' : 'Set the location and secure video source'}</p></div><button type="button" className="camera-close" onClick={() => setEditing(null)} aria-label="Close"><X size={18} /></button></div>
      <div className="mb camera-modal-body">
        <div className="camera-form-section"><div className="camera-section-title"><MapPinned size={15} /><span>{lang ? 'هوية وموقع الكاميرا' : 'Camera identity & location'}</span></div>
          <div className="frow"><div className="fg"><label><Hash size={13} /> {importingWholeDvr ? (lang ? 'بادئة المعرّف' : 'ID prefix') : 'Camera ID'}</label><input type="text" required disabled={editing !== 'new'} value={form.id} onChange={(event) => setForm({ ...form, id: event.target.value })} placeholder={importingWholeDvr ? 'LOBBY-DVR' : 'CAM-01'} />{importingWholeDvr && <small className="camera-import-hint">{lang ? `ستكون المعرّفات ${(form.id || 'LOBBY-DVR').toUpperCase()}-CH1 …` : `Cameras become ${(form.id || 'LOBBY-DVR').toUpperCase()}-CH1, -CH2, …`}</small>}</div><div className="fg"><label><Camera size={13} /> Display name</label><input type="text" required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Main gate" /></div></div>
          {/* Project and building are where the Units module gets its
              structure from, so they are asked for on every camera. */}
          <div className="frow"><div className="fg"><label><Layers size={13} /> Project</label><input type="text" value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })} placeholder="West Town Residence" /></div><div className="fg"><label><Building2 size={13} /> Building</label><input type="text" value={form.buildingCode} onChange={(event) => setForm({ ...form, buildingCode: event.target.value })} placeholder="4.6-C" /></div></div>
          <div className="frow"><div className="fg"><label><MapPin size={13} /> Zone</label><select value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })}>{ZONES.map((zone, index) => <option value={index} key={zone[0]}>{zone[lang]}</option>)}</select></div></div>
          <div className="fg camera-last-field"><label><MapPinned size={13} /> Exact location</label><input type="text" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Lobby north entrance" /></div>
        </div>
        <div className="camera-form-section"><div className="camera-section-title"><Video size={15} /><span>{lang ? 'إعدادات البث' : 'Stream configuration'}</span></div>
          <div className="frow"><div className="fg"><label><Video size={13} /> {lang ? 'نوع المصدر' : 'Source type'}</label><select value={form.sourceMode} onChange={(event) => setForm({ ...form, sourceMode: event.target.value })}>{editing === 'new' && <option value="dvr-all">{lang ? 'مسجل كامل — كل القنوات' : 'Whole DVR / NVR — all channels'}</option>}<option value="dvr">{lang ? 'قناة واحدة من المسجل' : 'Single DVR / NVR channel'}</option><option value="url">{lang ? 'رابط RTSP مباشر' : 'Direct RTSP URL'}</option></select></div><div className="fg" /></div>

          {isDvrMode ? <>
            <div className="frow"><div className="fg"><label><Wifi size={13} /> {lang ? 'عنوان IP' : 'IP / host'}</label><input type="text" required value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} placeholder="192.168.1.64" /></div><div className="fg"><label><Hash size={13} /> {lang ? 'منفذ RTSP' : 'RTSP port'}</label><input type="number" min="1" max="65535" value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} /></div></div>
            <div className="frow"><div className="fg"><label><Settings size={13} /> {lang ? 'اسم المستخدم' : 'Username'}</label><input type="text" required autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="admin" /></div><div className="fg"><label><ShieldCheck size={13} /> {lang ? 'كلمة المرور' : 'Password'} {editing !== 'new' && <em>({lang ? 'اتركها فارغة للاحتفاظ بالحالية' : 'leave blank to keep current'})</em>}</label><input type="password" autoComplete="new-password" required={editing === 'new'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div></div>
            <div className="frow"><div className="fg"><label><Cpu size={13} /> {lang ? 'الماركة' : 'Brand'}</label><select value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })}>{BRANDS.map((brand) => <option value={brand} key={brand}>{brand}</option>)}</select></div>{form.sourceMode === 'dvr-all'
              ? <div className="fg"><label><List size={13} /> {lang ? 'عدد القنوات في المسجل' : 'Channels on this DVR'}</label><input type="number" min="1" max="64" required value={form.channels} onChange={(event) => setForm({ ...form, channels: event.target.value })} /></div>
              : <div className="fg"><label><List size={13} /> {lang ? 'القناة' : 'Channel'}</label><input type="number" min="1" max="64" required value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} /></div>}</div>
            <div className="frow"><div className="fg"><label><Video size={13} /> {lang ? 'التدفق' : 'Stream'}</label><select value={form.stream} onChange={(event) => setForm({ ...form, stream: event.target.value })}><option value="sub">{lang ? 'فرعي (موصى به)' : 'sub (recommended)'}</option><option value="main">main</option></select></div><div className="fg" /></div>
            {form.sourceMode === 'dvr-all' && <div className="camera-import-box">
              <p className="camera-import-hint">{lang
                ? `سيتم إنشاء كاميرا لكل قناة (${form.channels || 0} كاميرا) فتظهر جميعها في جدار البث.`
                : `Creates one camera per channel (${form.channels || 0} in total), so every feed appears on the live wall.`}</p>
              <div className="fg"><label><PlugZap size={13} /> {lang ? 'القنوات غير المتصلة' : 'Channels that do not respond'}</label><select value={String(form.probeChannels === true)} onChange={(event) => setForm({ ...form, probeChannels: event.target.value === 'true' })}><option value="false">{lang ? 'إضافتها على أي حال' : 'Add them anyway'}</option><option value="true">{lang ? 'اختبار كل قناة وتخطي الفارغة (أبطأ)' : 'Test each channel and skip empty ones (slower)'}</option></select></div>
            </div>}
            {form.brand === 'custom' && <div className="fg"><label><Wifi size={13} /> {lang ? 'قالب رابط مخصص' : 'Custom URL template'}</label><input type="text" required value={form.urlTemplate} onChange={(event) => setForm({ ...form, urlTemplate: event.target.value })} placeholder="rtsp://{user}:{pass}@{host}:{port}/..." /></div>}
            <div className="camera-security-hint"><ShieldCheck size={15} /><span>{lang ? 'يبني الخادم رابط RTSP ويشفّره. كلمة المرور لا تعود للمتصفح أبدًا.' : 'The server builds and encrypts the RTSP URL. The password is never returned to the browser.'}</span></div>
          </> : <div className="fg"><label><Wifi size={13} /> RTSP URL {editing !== 'new' && <em>({lang ? 'اتركه فارغًا للاحتفاظ بالحالي' : 'leave blank to keep current'})</em>}</label><input required={editing === 'new'} type="password" autoComplete="new-password" value={form.rtspUrl} onChange={(event) => setForm({ ...form, rtspUrl: event.target.value })} placeholder="rtsp://user:password@192.168.1.50:554/stream" /><div className="camera-security-hint"><ShieldCheck size={15} /><span>{lang ? 'يتم تشفير بيانات الدخول ولا يتم إرسالها للمتصفح.' : 'Credentials are encrypted and never returned to the browser.'}</span></div></div>}
          <div className="frow camera-last-row"><div className="fg"><label><Cpu size={13} /> Codec</label><select value={form.codec} onChange={(event) => setForm({ ...form, codec: event.target.value })}><option value="unknown">Auto / unknown</option><option value="h264">H.264</option><option value="h265">H.265</option></select></div><div className="fg"><label><Power size={13} /> State</label><select value={String(form.enabled)} onChange={(event) => setForm({ ...form, enabled: event.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></div></div>
        </div>
        {feedback && <div className={`camera-feedback ${feedback.ok ? 'success' : 'error'}`}>{feedback.text}</div>}
      </div>
      <div className="mf camera-modal-footer">{editing !== 'new' && <button type="button" className="btn camera-delete-button" onClick={deleteCamera}><Trash2 size={14} /> {lang ? 'حذف' : 'Delete'}</button>}<div className="grow" />{editing !== 'new' && <button type="button" className="btn ghost camera-test-button" disabled={saving || (!form.rtspUrl && !form.host && !cameras.find((camera) => camera.id === editing)?.rtspConfigured)} onClick={testCamera}><PlugZap size={14} /> {lang ? 'اختبار الاتصال' : 'Test connection'}</button>}<button className="btn camera-save-button" disabled={saving}>{saving
        ? (lang ? 'جاري الحفظ…' : 'Working…')
        : importingWholeDvr
          ? (lang ? `إضافة ${form.channels || 0} قناة` : `Add all ${form.channels || 0} channels`)
          : (lang ? 'حفظ الكاميرا' : 'Save camera')}</button></div>
    </form></div>}
  </>;
}

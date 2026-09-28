import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Download, Eye, Map, MapPin, Clock, Timer, Route, ShieldAlert, UserX, User, Building2, Cctv, CalendarDays } from 'lucide-react';
import { apiFetch } from '../api';
import { displayName } from '../utils/display';
import { formatWhen } from './AlertsPage';
import { DEMO, demoHistory, demoSubjects } from '../demo';
import { snapshotUrl } from '../utils/snapshot';

const where = (d) => `${d.camera?.building || '—'} · ${d.camera?.name || d.cam}`;

function countBy(list, key) {
  const out = {};
  list.forEach(item => { const k = key(item); out[k] = (out[k] || 0) + 1; });
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

function duration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h`;
}

function analyze(evs) {
  if (!evs.length) return null;
  const ts = evs.map(e => Date.parse(e.when)).filter(Number.isFinite);
  const hours = countBy(evs, e => new Date(e.when).getHours());
  const cams = countBy(evs, where);
  return {
    total: evs.length,
    buildings: countBy(evs, e => e.camera?.building || '—'),
    cameras: cams,
    days: new Set(evs.map(e => formatWhen(e.when).slice(0, 10))).size,
    busy: `${cams[0][0]} (${cams[0][1]})`,
    peak: `${String(hours[0][0]).padStart(2, '0')}:00`,
    span: ts.length ? duration(Math.max(...ts) - Math.min(...ts)) : '—',
    first: evs[evs.length - 1]?.when,
    last: evs[0]?.when,
  };
}

function exportCsv(subjectId, evs) {
  const rows = [['when', 'building', 'camera', 'channel', 'conf', 'decision']]
    .concat(evs.map(e => [formatWhen(e.when), e.camera?.building ?? '', e.camera?.name ?? e.cam, e.camera?.channel ?? '', e.conf, e.decision ?? '']));
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `track-${subjectId}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function TrackPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [params, setParams] = useSearchParams();
  const selected = params.get('face') || '';
  const [subjects, setSubjects] = useState([]);
  const [faceSearch, setFaceSearch] = useState('');
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (DEMO ? Promise.resolve(demoSubjects()) : apiFetch('/detections/subjects')
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(list => {
        setSubjects(list);
        // Nothing chosen yet: follow whoever was seen most recently.
        if (!params.get('face') && list[0]) setParams({ face: list[0].id }, { replace: true });
      })
      .catch(err => setError(err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) return;
    setHistory(null);
    if (DEMO) { setHistory(demoHistory(selected)); return; }
    apiFetch(`/detections/history/${encodeURIComponent(selected)}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(res.status === 404 ? (lang ? 'لا يوجد سجل لهذا الشخص' : 'No record for this person') : `HTTP ${res.status}`)))
      .then(data => { setHistory(data); setError(''); })
      .catch(err => setError(err.message));
  }, [selected, lang]);

  const evs = useMemo(() => history?.detections ?? [], [history]);
  const stats = useMemo(() => analyze(evs), [evs]);
  const f = history?.subject;
  const tier = f?.known ? f.type : 'unknown';
  const name = (s) => s?.known ? displayName(s, lang, s.id) : `${lang ? 'غريب' : 'Stranger'} · ${s?.id}`;

  const faceOptions = subjects.filter(x =>
    (x.id + ' ' + (x.name ?? []).join(' ')).toLowerCase().includes(faceSearch.toLowerCase()));
  if (selected && !faceOptions.some(x => x.id === selected) && f) faceOptions.unshift({ ...f, count: history.total });

  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('nav.track')}</h1>
          <div className="sub">{lang ? 'مسار متعدد الكاميرات + تحليل الحركة' : 'cross-camera path + movement analysis'}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input
          type="text"
          className="search"
          placeholder={lang ? 'بحث في الوجوه…' : 'Search faces…'}
          value={faceSearch}
          onChange={e => setFaceSearch(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg2)', color: 'var(--fg)', width: 180 }}
        />
        <select value={selected} onChange={e => setParams({ face: e.target.value })}>
          {!selected && <option value="">{lang ? 'اختر شخصاً' : 'Choose a person'}</option>}
          {faceOptions.map(x => (
            <option key={x.id} value={x.id}>{name(x)} · {x.count ?? 0} {lang ? 'اكتشاف' : 'sightings'}</option>
          ))}
        </select>
        <div className="grow" />
        <button className="btn ghost sm" disabled={!evs.length} onClick={() => exportCsv(selected, evs)}><Download size={14} /> Export CSV</button>
      </div>

      {error && <div className="panel glass-panel" style={{ padding: 16, marginBottom: 16, color: 'var(--red)' }}>{error}</div>}
      {!selected && !error && <div className="sub" style={{ padding: 20 }}>{lang ? 'لم تكتشف الكاميرات أي شخص بعد.' : 'No one has been detected yet.'}</div>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
          {[
            [lang ? 'مرات الاكتشاف' : 'Times detected', stats.total, Eye, 'blue'],
            [lang ? 'المباني' : 'Buildings', stats.buildings.length, Building2, 'green'],
            [lang ? 'الكاميرات' : 'Cameras', stats.cameras.length, Map, 'green'],
            [lang ? 'أيام الظهور' : 'Days seen', stats.days, CalendarDays, 'blue'],
            [lang ? 'الموقع الأكثر ظهوراً' : 'Most seen at', stats.busy, MapPin, 'amber'],
            [lang ? 'ذروة النشاط' : 'Peak hour', stats.peak, Clock, 'red'],
            [lang ? 'من أول لآخر ظهور' : 'First → last seen', stats.span, Timer, 'blue'],
          ].map(([label, value, Icon, colorClass]) => (
            <div key={label} className="kpi-card glass-panel" style={{ padding: '16px' }}>
              <div className="kpi-header" style={{ marginBottom: 12 }}>
                <span className={`kpi-icon ${colorClass}`}><Icon size={18} /></span>
                <div className="lab">{label}</div>
              </div>
              <div className="kpi-body">
                <div className="val a" style={{ fontSize: String(value).length > 8 ? 16 : 28 }}>{value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {f && (
        <div className="two">
          <div className="panel glass-panel">
            <h3>
              <span className="face-th" style={{ width: 44, height: 44, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', marginInlineEnd: 12 }}>
                {tier === 'watch' ? <ShieldAlert size={20} color="var(--red)" /> :
                 tier === 'unknown' ? <UserX size={20} color="var(--amber)" /> :
                 <User size={20} color="var(--green)" />}
              </span>
              {f.known ? displayName(f, lang) : (lang ? 'غريب' : 'Stranger')} <span className={`tag ${tier}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{t(`face.${tier}`)}</span>
            </h3>
            <table>
              <tbody>
                <tr><td className="mono">Face ID</td><td className="mono">{f.id}</td></tr>
                {f.known && <>
                  <tr><td className="mono">{lang ? 'الصفة' : 'Role'}</td><td>{displayName({ name: f.role }, lang, '—')}</td></tr>
                  <tr><td className="mono">{lang ? 'المبنى / الوحدة' : 'Home'}</td><td>{f.bldg ? `${f.bldg} · ${f.unit || '—'}` : '—'}</td></tr>
                  <tr><td className="mono">ID / Card</td><td className="mono">{f.idno || '—'}</td></tr>
                  <tr><td className="mono">{lang ? 'تاريخ التسجيل' : 'Enrolled'}</td><td>{f.enroll || '—'}</td></tr>
                </>}
                <tr><td className="mono">{lang ? 'إجمالي الاكتشافات' : 'Total detections'}</td><td>{history.total}</td></tr>
                {stats && <>
                  <tr><td className="mono">{lang ? 'أول ظهور' : 'First seen'}</td><td className="mono">{formatWhen(stats.first)}</td></tr>
                  <tr><td className="mono">{lang ? 'آخر ظهور' : 'Last seen'}</td><td className="mono">{formatWhen(stats.last)}</td></tr>
                </>}
              </tbody>
            </table>

            {stats && (
              <>
                <h3 style={{ marginTop: 20 }}><Building2 size={16} color="var(--accent)" /> {lang ? 'الاكتشافات حسب الموقع' : 'Detections by location'}</h3>
                <table>
                  <tbody>
                    {stats.cameras.map(([loc, n]) => (
                      <tr key={loc}><td>{loc}</td><td style={{ textAlign: 'end' }}><b>{n}</b></td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {!f.known && (
              <div className="note" style={{ marginTop: 12 }}>
                {lang ? 'غريب: غير مسجل في قاعدة البيانات. يُجمع سجله لكل زيارة أمام كاميرا واحدة.' : 'Stranger: not in the database. Sightings are grouped per visit in front of one camera.'}
              </div>
            )}
          </div>

          <div className="panel glass-panel">
            <h3><Route size={18} color="var(--accent)" /> {lang ? 'السجل الكامل للتحركات' : 'Full movement history'} ({evs.length})</h3>
            <div className="tl" style={{ maxHeight: 560, overflowY: 'auto' }}>
              {evs.length ? evs.map(e => (
                <div key={e.id} className={`ev ${e.type}`}>
                  {/* The face this sighting was recognised from. A row saying
                      somebody was seen is of little use without it. */}
                  {e.snapshot && e.snapshotToken ? (
                    <a className="ev-shot" href={snapshotUrl(e.snapshot, e.snapshotToken)} target="_blank" rel="noreferrer"
                      title={lang ? 'فتح الصورة' : 'Open full image'}>
                      <img src={snapshotUrl(e.snapshot, e.snapshotToken)} alt={lang ? 'لقطة الوجه' : 'Captured face'} loading="lazy" />
                    </a>
                  ) : null}
                  <b><Building2 size={12} style={{ verticalAlign: -1 }} /> {e.camera?.building || '—'}</b> · <Cctv size={12} style={{ verticalAlign: -1 }} /> {e.camera?.name || e.cam}{e.camera?.channel ? ` · CH${e.camera.channel}` : ''}
                  <div className="mono">{formatWhen(e.when)} · conf {e.conf}%</div>
                </div>
              )) : <div className="sub">{lang ? 'لم يُكتشف بعد' : 'Not seen by any camera yet'}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

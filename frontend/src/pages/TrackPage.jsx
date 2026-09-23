import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, UserPlus, Eye, Map, MapPin, Clock, Timer, Route, ShieldAlert, UserX, User } from 'lucide-react';
import { FACES, DETECTIONS, ZONES } from '../store';

function analyze(fid, evs, lang) {
  if (!evs.length) return null;
  const zc = {};
  evs.forEach(e => { zc[e.zone] = (zc[e.zone] || 0) + 1; });
  const [busyZone, busyCount] = Object.entries(zc).sort((a,b) => b[1]-a[1])[0];
  const hours = evs.map(e => +e.when.slice(11, 13));
  const hc = {};
  hours.forEach(h => { hc[h] = (hc[h] || 0) + 1; });
  const [peak] = Object.entries(hc).sort((a,b) => b[1]-a[1])[0];
  const ts = evs.map(e => e.ts);
  const span = Math.round((Math.max(...ts) - Math.min(...ts)) / 60000);
  return {
    total: evs.length,
    zones: Object.keys(zc).length,
    busy: ZONES[busyZone][lang] + ' (' + busyCount + ')',
    peak: peak + ':00',
    span: span + ' min',
    first: evs[evs.length - 1]?.when,
    last: evs[0]?.when,
  };
}

export default function TrackPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [selectedFace, setSelectedFace] = useState('F-0087');
  const [faceSearch, setFaceSearch] = useState('');

  const f = FACES.find(x => x.id === selectedFace);
  const evs = DETECTIONS.filter(d => d.face === selectedFace);
  const stats = analyze(selectedFace, evs, lang);

  const faceOptions = FACES.filter(x =>
    (x.id + x.name[0] + x.name[1]).toLowerCase().includes(faceSearch.toLowerCase())
  );

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
        <select value={selectedFace} onChange={e => setSelectedFace(e.target.value)}>
          {faceOptions.map(x => (
            <option key={x.id} value={x.id}>{x.id} · {x.name[lang]}</option>
          ))}
        </select>
        <div className="grow" />
        <button className="btn ghost sm"><Download size={14} /> Export CSV</button>
        {f?.type === 'unknown' && <button className="btn sm"><UserPlus size={14} /> {lang ? 'تعريف/تسجيل' : 'Identify/Enroll'}</button>}
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
          {[
            [lang ? 'الاكتشافات' : 'Detections', stats.total, Eye, 'blue'],
            [lang ? 'مواقع مزارة' : 'Locations visited', stats.zones, Map, 'green'],
            [lang ? 'المنطقة الأكثر نشاطاً' : 'Busiest zone', stats.busy, MapPin, 'amber'],
            [lang ? 'ذروة النشاط' : 'Peak hour', stats.peak, Clock, 'red'],
            [lang ? 'الوقت في الموقع' : 'Time on site', stats.span, Timer, 'blue'],
          ].map(([label, value, Icon, colorClass]) => (
            <div key={label} className="kpi-card glass-panel" style={{ padding: '16px' }}>
              <div className="kpi-header" style={{ marginBottom: 12 }}>
                <span className={`kpi-icon ${colorClass}`}>
                  <Icon size={18} />
                </span>
                <div className="lab">{label}</div>
              </div>
              <div className="kpi-body">
                <div className="val a" style={{ fontSize: value?.length > 8 ? 20 : 28 }}>{value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="two">
        {/* Face profile */}
        <div className="panel glass-panel">
          <h3>
            <span className="face-th" style={{ width: 44, height: 44, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', marginInlineEnd: 12 }}>
              {f?.type === 'watch' ? <ShieldAlert size={20} color="var(--red)" /> : 
               f?.type === 'unknown' ? <UserX size={20} color="var(--amber)" /> : 
               <User size={20} color="var(--green)" />}
            </span>
            {f?.name[lang]} <span className={`tag ${f?.type}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{t(`face.${f?.type}`)}</span>
          </h3>
          <table>
            <tbody>
              <tr><td className="mono">Face ID</td><td>{f?.id}</td></tr>
              <tr><td className="mono">ID / Card</td><td>{f?.idno} {f?.issuer !== '—' ? '· ' + f?.issuer : ''}</td></tr>
              <tr><td className="mono">Status</td><td>{f?.role[lang]}</td></tr>
              <tr><td className="mono">Enrolled</td><td>{f?.enroll}</td></tr>
              <tr><td className="mono">Total on record</td><td>{DETECTIONS.filter(d => d.face === f?.id).length}</td></tr>
            </tbody>
          </table>
          {f?.type === 'unknown' && (
            <div className="note" style={{ marginTop: 12 }}>
              {lang ? 'غريب — معرّف مجهول، لا هوية بعد.' : 'Stranger — anonymous ID, no identity yet. Identify/Enroll to capture biometric.'}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="panel glass-panel">
          <h3><Route size={18} color="var(--accent)" /> {lang ? 'خط زمني للتحركات' : 'Movement timeline'}</h3>
          <div className="tl">
            {evs.length ? evs.map((e, i) => (
              <div key={i} className={`ev ${e.type}`}>
                <b>{ZONES[e.zone][lang]}</b> · {e.cam}
                <div>{e.when} · conf {e.conf}%</div>
              </div>
            )) : <div className="sub">No detections in range</div>}
          </div>
        </div>
      </div>
    </>
  );
}

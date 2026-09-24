import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Building2, Home, CheckCircle, ShieldAlert, Users, UserX, Camera } from 'lucide-react';
import { apiFetch } from '../api';
import { displayName } from '../utils/display';

function ProgressBar({ value, max }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg2)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', transition: 'width 0.4s' }} />
      </div>
      <span className="mono" style={{ fontSize: 12 }}>{pct}%</span>
    </div>
  );
}

export default function BuildingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [selected, setSelected] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [faces, setFaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([apiFetch('/buildings'), apiFetch('/faces')])
      .then(async ([buildingResponse, faceResponse]) => {
        if (!buildingResponse.ok || !faceResponse.ok) throw new Error('Could not load building data.');
        const [buildingData, faceData] = await Promise.all([buildingResponse.json(), faceResponse.json()]);
        setBuildings(Array.isArray(buildingData) ? buildingData : []);
        setFaces(Array.isArray(faceData) ? faceData : []);
      })
      .catch((error) => setLoadError(error.message || 'Could not load building data.'))
      .finally(() => setLoading(false));
  }, []);

  const totUnits   = buildings.reduce((s, b) => s + b.units, 0);
  const totEnrolled = buildings.reduce((s, b) => s + b.enrolled, 0);
  const totStr     = buildings.reduce((s, b) => s + b.strangersToday, 0);

  if (loading) return <div className="panel"><div className="sub">Loading buildings…</div></div>;
  if (loadError) return <div className="panel"><div className="err">{loadError}</div></div>;

  if (selected) {
    const b = buildings.find(x => x.code === selected);
    if (!b) return null;
    const owners   = faces.filter(f => f.bldg === selected && (f.type === 'known' || f.type === 'staff'));
    const strangers = faces.filter(f => f.bldg === selected && (f.type === 'unknown' || f.type === 'watch'));
    return (
      <>
        <div className="ph">
          <div>
            <h1>{t('nav.buildings')} — {displayName(b, lang, b.code)}</h1>
            <div className="sub">{b.code} · STMC</div>
          </div>
        </div>
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <button className="btn ghost sm" onClick={() => setSelected(null)}>← {t('nav.buildings')}</button>
        </div>
        <div className="kpis">
          <div className="kpi-card glass-panel">
            <div className="kpi-header"><span className="kpi-icon blue"><Home size={18} /></span><div className="lab">{t('buildings.units')}</div></div>
            <div className="kpi-body"><div className="val a">{b.units}</div></div>
          </div>
          <div className="kpi-card glass-panel">
            <div className="kpi-header"><span className="kpi-icon green"><CheckCircle size={18} /></span><div className="lab">{t('buildings.enrolled')}</div></div>
            <div className="kpi-body"><div className="val g">{b.enrolled}</div><div className="tr">{Math.round(b.enrolled/b.units*100)}% coverage</div></div>
          </div>
          <div className="kpi-card glass-panel">
            <div className="kpi-header"><span className="kpi-icon blue"><Camera size={18} /></span><div className="lab">Cameras</div></div>
            <div className="kpi-body"><div className="val a">{b.cams}</div></div>
          </div>
          <div className="kpi-card glass-panel">
            <div className="kpi-header"><span className="kpi-icon red"><ShieldAlert size={18} /></span><div className="lab">{t('buildings.strangers_today')}</div></div>
            <div className="kpi-body"><div className={`val ${b.strangersToday ? 'r' : 'g'}`}>{b.strangersToday}</div></div>
          </div>
        </div>
        <div className="two">
          <div className="panel glass-panel">
            <h3><Users size={18} color="var(--green)" /> {lang ? 'السكان المسجّلون / الموظفون' : 'Enrolled residents / staff'}</h3>
            <table>
              <thead><tr><th>Face</th><th>{lang ? 'الاسم' : 'Name'}</th><th>{lang ? 'الوحدة' : 'Unit'}</th></tr></thead>
              <tbody>
                {owners.length ? owners.map(f => (
                  <tr key={f.id} onClick={() => navigate('/track')} style={{ cursor: 'pointer' }}>
                    <td className="mono" style={{ color: '#fff' }}>{f.id}</td>
                    <td>{displayName(f, lang, f.id)}</td>
                    <td className="mono">{f.unit || '—'}</td>
                  </tr>
                )) : <tr><td colSpan={3} className="sub">None yet</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="panel glass-panel">
            <h3><UserX size={18} color="var(--red)" /> {lang ? 'غرباء / قائمة المنع' : 'Strangers / watchlist seen here'}</h3>
            <table>
              <thead><tr><th>Face</th><th>{lang ? 'الفئة' : 'Tier'}</th><th /></tr></thead>
              <tbody>
                {strangers.length ? strangers.map(f => (
                  <tr key={f.id}>
                    <td className="mono">{f.id}</td>
                    <td><span className={`tag ${f.type}`}>{t(`face.${f.type}`)}</span></td>
                    <td><button className="btn ghost sm" onClick={() => navigate('/track')}>Track</button></td>
                  </tr>
                )) : <tr><td colSpan={3} className="sub">None</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="note">{lang ? 'التعرف في هذا المبنى: السكان المسجّلون مسموح لهم، الوجوه غير المسجّلة تُعلَّم كغرباء وترفع للغرفة.' : 'Recognition at this building: enrolled residents are allowed; unenrolled faces are flagged as strangers.'}</div>
      </>
    );
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('nav.buildings')}</h1>
          <div className="sub">{t('buildings.subtitle')}</div>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi-card glass-panel">
          <div className="kpi-header"><span className="kpi-icon blue"><Building2 size={18} /></span><div className="lab">{lang ? 'المباني' : 'Buildings'}</div></div>
          <div className="kpi-body"><div className="val a">{buildings.length}</div><div className="tr">Monitored</div></div>
        </div>
        <div className="kpi-card glass-panel">
          <div className="kpi-header"><span className="kpi-icon blue"><Home size={18} /></span><div className="lab">{t('buildings.units')}</div></div>
          <div className="kpi-body"><div className="val a">{totUnits}</div><div className="tr">Total capacity</div></div>
        </div>
        <div className="kpi-card glass-panel">
          <div className="kpi-header"><span className="kpi-icon green"><CheckCircle size={18} /></span><div className="lab">{t('buildings.enrolled')}</div></div>
          <div className="kpi-body"><div className="val g">{totEnrolled}</div><div className="tr">Verified identities</div></div>
        </div>
        <div className="kpi-card glass-panel">
          <div className="kpi-header"><span className="kpi-icon red"><ShieldAlert size={18} /></span><div className="lab">{t('buildings.strangers_today')}</div></div>
          <div className="kpi-body"><div className={`val ${totStr ? 'r' : 'g'}`}>{totStr}</div><div className="tr">Unrecognized</div></div>
        </div>
      </div>

      <div className="note">{lang ? 'STMC — إدارة الدخول واكتشاف الوجوه غير المسجلة لكل مبنى.' : 'STMC — building-level access and unregistered-face detection.'}</div>

      <div className="panel glass-panel" style={{ padding: 0, overflowX: 'auto', border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th>{lang ? 'المبنى' : 'Building'}</th>
              <th>{t('buildings.units')}</th>
              <th>{t('buildings.enrolled')}</th>
              <th>Coverage</th>
              <th>Cameras</th>
              <th>{t('buildings.strangers_today')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {buildings.map(b => (
              <tr key={b.code} onClick={() => setSelected(b.code)} style={{ cursor: 'pointer' }}>
                <td><b>{displayName(b, lang, b.code)}</b> <span className="mono">{b.code}</span></td>
                <td>{b.units}</td>
                <td>{b.enrolled}</td>
                <td><ProgressBar value={b.enrolled} max={b.units} /></td>
                <td>{b.cams}</td>
                <td>{b.strangersToday ? <span className="tag watch">{b.strangersToday}</span> : <span className="tag known">0</span>}</td>
                <td><ChevronRight size={16} style={{ color: 'var(--muted)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

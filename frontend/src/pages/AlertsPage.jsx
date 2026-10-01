import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bell, ShieldAlert, UserX, User, Activity, Info, Building2, Cctv, Clock, Gauge, Filter, X } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import { useRealtime } from '../hooks/useRealtime';
import { displayName } from '../utils/display';
import { DEMO, demoAlerts } from '../demo';
import { snapshotUrl } from '../utils/snapshot';

/** "2026-09-26T11:54:41.293Z" -> "2026-09-26 14:54:41" in the viewer's local time. */
export function formatWhen(when) {
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return when || '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function AlertsPage() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const BLANK = { person: '', camera: '', building: '', project: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '' };
  const [filters, setFilters] = useState(BLANK);
  const [showFilters, setShowFilters] = useState(false);
  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }));

  const loadAlerts = useCallback(() => DEMO ? Promise.resolve(setAlerts(demoAlerts())) : apiFetch('/alerts')
    .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
    .then(data => { setAlerts(data); setError(''); })
    .catch(err => setError(err.message)), []);
  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useRealtime((event) => {
    if (event.type.startsWith('alert.')) loadAlerts();
  }, Boolean(session));

  // Dropdown options come from the alerts actually present, so a filter can
  // never offer a value that would return nothing.
  const optionsFor = (read) => [...new Set(alerts.map(read).filter(Boolean))].sort();
  const cameraOptions = optionsFor(a => a.camera?.name || a.cam);
  const buildingOptions = optionsFor(a => a.camera?.building);
  const projectOptions = optionsFor(a => a.camera?.project);

  const matches = (alert) => {
    const haystack = [alert.face, alert.cam, ...(alert.subject?.name ?? []),
      alert.camera?.name, alert.camera?.building, alert.camera?.project].join(' ').toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;

    if (filters.person) {
      const named = [...(alert.subject?.name ?? []), alert.face].join(' ').toLowerCase();
      if (!named.includes(filters.person.toLowerCase())) return false;
    }
    if (filters.camera && (alert.camera?.name || alert.cam) !== filters.camera) return false;
    if (filters.building && alert.camera?.building !== filters.building) return false;
    if (filters.project && alert.camera?.project !== filters.project) return false;

    // Date and time are compared in the viewer's own timezone, matching the
    // timestamp shown on each row -- comparing the raw UTC string instead
    // would put an evening sighting on the wrong day.
    const at = new Date(alert.when);
    if (Number.isNaN(at.getTime())) return !filters.dateFrom && !filters.dateTo && !filters.timeFrom && !filters.timeTo;
    const pad = (n) => String(n).padStart(2, '0');
    const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;

    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
    // A window that wraps midnight (22:00 -> 04:00) is read as "either end
    // of the night", which is what a night shift means by it.
    if (filters.timeFrom && filters.timeTo) {
      const overnight = filters.timeFrom > filters.timeTo;
      const inside = overnight
        ? (time >= filters.timeFrom || time <= filters.timeTo)
        : (time >= filters.timeFrom && time <= filters.timeTo);
      if (!inside) return false;
    } else if (filters.timeFrom && time < filters.timeFrom) return false;
    else if (filters.timeTo && time > filters.timeTo) return false;

    return true;
  };

  const filtered = alerts.filter(matches);
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const track = (a) => navigate(`/track?face=${encodeURIComponent(a.face)}`);

  return (
    <>
      <div className="ph">
        <div>
          <h1><Bell size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.alerts')}</h1>
          <div className="sub">{alerts.length} {lang ? 'تنبيه' : alerts.length === 1 ? 'alert' : 'alerts'}</div>
        </div>
      </div>

      <div className="panel glass-panel" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <Info size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          {lang
            ? 'كل تنبيه يعني أن شخصاً — ساكناً كان أو غريباً — قد رُصد عند إحدى الكاميرات. اضغط على أي تنبيه لعرض مسار الشخص.'
            : <>Each alert means a person — resident or stranger — was seen by a camera. <span style={{ opacity: 0.7 }}>Click any alert to open that person in Track &amp; Trace.</span></>}
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search">
          <input type="text" placeholder={lang ? 'بحث بالاسم أو الكاميرا أو المبنى…' : 'Search name, camera, building…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={`btn ${showFilters || activeFilters ? '' : 'ghost'} sm`} onClick={() => setShowFilters(open => !open)}>
          <Filter size={14} /> {lang ? 'فلاتر' : 'Filters'}{activeFilters ? ` (${activeFilters})` : ''}
        </button>
        <div className="grow" />
        <span className="sub" style={{ fontSize: 12 }}>
          {filtered.length === alerts.length
            ? `${alerts.length} ${lang ? 'تنبيه' : 'alerts'}`
            : `${filtered.length} ${lang ? 'من' : 'of'} ${alerts.length}`}
        </span>
      </div>

      {showFilters && (
        <div className="panel glass-panel" style={{ padding: 16, marginBottom: 16 }}>
          <div className="enrollment-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <div className="fg">
              <label htmlFor="f-person">{lang ? 'اسم الشخص' : 'Person / owner name'}</label>
              <input id="f-person" type="text" value={filters.person}
                placeholder={lang ? 'أي جزء من الاسم' : 'any part of the name'}
                onChange={e => setFilter('person', e.target.value)} />
            </div>
            <div className="fg">
              <label htmlFor="f-camera">{lang ? 'الكاميرا' : 'Camera'}</label>
              <select id="f-camera" value={filters.camera} onChange={e => setFilter('camera', e.target.value)}>
                <option value="">{lang ? 'كل الكاميرات' : 'All cameras'}</option>
                {cameraOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="fg">
              <label htmlFor="f-building">{lang ? 'المبنى' : 'Building'}</label>
              <select id="f-building" value={filters.building} onChange={e => setFilter('building', e.target.value)}>
                <option value="">{lang ? 'كل المباني' : 'All buildings'}</option>
                {buildingOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="fg">
              <label htmlFor="f-project">{lang ? 'المشروع' : 'Project'}</label>
              <select id="f-project" value={filters.project} onChange={e => setFilter('project', e.target.value)}>
                <option value="">{lang ? 'كل المشاريع' : 'All projects'}</option>
                {projectOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="fg">
              <label htmlFor="f-date-from">{lang ? 'من تاريخ' : 'Date from'}</label>
              <input id="f-date-from" type="date" value={filters.dateFrom} max={filters.dateTo || undefined}
                onChange={e => setFilter('dateFrom', e.target.value)} />
            </div>
            <div className="fg">
              <label htmlFor="f-date-to">{lang ? 'إلى تاريخ' : 'Date to'}</label>
              <input id="f-date-to" type="date" value={filters.dateTo} min={filters.dateFrom || undefined}
                onChange={e => setFilter('dateTo', e.target.value)} />
            </div>
            <div className="fg">
              <label htmlFor="f-time-from">{lang ? 'من ساعة' : 'Time from'}</label>
              <input id="f-time-from" type="time" value={filters.timeFrom}
                onChange={e => setFilter('timeFrom', e.target.value)} />
            </div>
            <div className="fg">
              <label htmlFor="f-time-to">{lang ? 'إلى ساعة' : 'Time to'}</label>
              <input id="f-time-to" type="time" value={filters.timeTo}
                onChange={e => setFilter('timeTo', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <span className="hint" style={{ margin: 0 }}>
              {filters.timeFrom && filters.timeTo && filters.timeFrom > filters.timeTo
                ? (lang ? 'نافذة ليلية تمتد بعد منتصف الليل.' : 'Overnight window — spans midnight.')
                : (lang ? 'تُطبَّق الأوقات بتوقيتك المحلي.' : 'Times are matched in your local timezone.')}
            </span>
            <div className="grow" />
            <button className="btn ghost sm" disabled={!activeFilters}
              onClick={() => setFilters(BLANK)}>
              <X size={13} /> {lang ? 'مسح الفلاتر' : 'Clear filters'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length ? filtered.map(a => {
          const s = a.subject ?? {};
          const cam = a.camera ?? {};
          const motion = s.type === 'motion';
          const tier = s.known ? s.type : motion ? 'motion' : 'unknown';

          return (
            <div key={a.id} className="alert-row glass-panel" onClick={() => !motion && track(a)}
              title={motion ? undefined : (lang ? 'عرض في التتبع' : 'Open in Track & Trace')}
              style={{ padding: '12px 16px', borderLeftWidth: 4, borderRadius: 8, cursor: motion ? 'default' : 'pointer' }}>
              {/* The face the alert is about. Deciding whether to act on a
                  stranger means seeing who it was, not just that somebody
                  was seen. Falls back to the tier icon when no photo was
                  saved (face too small to be worth keeping, older rows). */}
              <div className="face-th" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, overflow: 'hidden' }}>
                {a.snapshot && a.snapshotToken ? (
                  <img src={snapshotUrl(a.snapshot, a.snapshotToken)}
                    alt={lang ? 'الوجه الملتقط' : 'Captured face'} loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : motion ? <Activity size={20} color="var(--accent)" /> :
                 tier === 'watch' ? <ShieldAlert size={20} color="var(--red)" /> :
                 tier === 'unknown' ? <UserX size={20} color="var(--amber)" /> :
                 <User size={20} color="var(--green)" />}
              </div>
              <div className="meta">
                <b style={{ fontSize: 14 }}>{s.known ? displayName(s, lang, a.face) : motion ? (lang ? 'حركة' : 'Movement detected') : (lang ? 'غريب' : 'Stranger')}</b>{' '}
                <span className={`tag ${motion ? 'actioned' : tier}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{motion ? (lang ? 'لا يظهر وجه' : 'No face visible') : t(`face.${tier}`)}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'center' }}>
                  <span><Building2 size={12} style={{ verticalAlign: -1 }} /> {cam.building || (lang ? 'مبنى غير محدد' : 'No building')}</span>
                  <span><Cctv size={12} style={{ verticalAlign: -1 }} /> {cam.name}{cam.channel ? ` · CH${cam.channel}` : ''}</span>
                  <span className="mono"><Clock size={12} style={{ verticalAlign: -1 }} /> {formatWhen(a.when)}</span>
                  {!motion && <span><Gauge size={12} style={{ verticalAlign: -1 }} /> conf {a.conf}%</span>}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="sub" style={{ padding: 20 }}>
            {error ? (lang ? 'تعذر تحميل التنبيهات: ' : 'Could not load alerts: ') + error
              : (lang ? 'لا توجد تنبيهات. تظهر هنا عند اكتشاف الكاميرات لأي شخص.' : 'No alerts yet. They appear here as soon as a camera detects someone.')}
          </div>
        )}
      </div>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Bell, ShieldAlert, UserX, User, Activity, Info, Building2, Cctv, Clock, Gauge } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import { useRealtime } from '../hooks/useRealtime';
import { displayName } from '../utils/display';
import { DEMO, demoAlerts } from '../demo';
import { snapshotUrl } from '../utils/snapshot';

const LIFECYCLE = ['new','ack','actioned','resolved','false'];

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
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadAlerts = useCallback(() => DEMO ? Promise.resolve(setAlerts(demoAlerts())) : apiFetch('/alerts')
    .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
    .then(data => { setAlerts(data); setError(''); })
    .catch(err => setError(err.message)), []);
  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useRealtime((event) => {
    if (event.type.startsWith('alert.')) loadAlerts();
  }, Boolean(session));

  const filtered = alerts.filter(a => {
    const who = [a.face, a.cam, ...(a.subject?.name ?? []), a.camera?.name, a.camera?.building].join(' ');
    return (statusFilter === 'all' || a.status === statusFilter) && who.toLowerCase().includes(search.toLowerCase());
  });
  const newCount = alerts.filter(a => a.status === 'new').length;

  const track = (a) => navigate(`/track?face=${encodeURIComponent(a.face)}`);

  return (
    <>
      <div className="ph">
        <div>
          <h1><Bell size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.alerts')}</h1>
          <div className="sub">{newCount} {lang ? 'جديد' : 'new'}</div>
        </div>
      </div>

      <div className="panel glass-panel" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <Info size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <b>{lang ? 'دورة التنبيه:' : 'Alert lifecycle (ACK cycle):'}</b>{' '}
          <span style={{ color: 'var(--red)' }}>● NEW</span> → <span style={{ color: 'var(--amber)' }}>● ACK</span> ({lang ? 'تملّك التنبيه' : 'you own it, logs user+time'}) → <span style={{ color: 'var(--accent)' }}>● ACTIONED</span> → <span style={{ color: 'var(--green)' }}>● RESOLVED</span> / <span style={{ color: 'var(--txt)' }}>○ FALSE</span>.{' '}
          <span style={{ opacity: 0.7 }}>{lang ? 'اضغط على أي تنبيه لعرض سجل تحركات الشخص.' : 'Click any alert to open that person in Track & Trace.'}</span>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="search">
          <input type="text" placeholder={lang ? 'بحث بالاسم أو الكاميرا أو المبنى…' : 'Search name, camera, building…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All status</option>
          {LIFECYCLE.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length ? filtered.map(a => {
          const s = a.subject ?? {};
          const cam = a.camera ?? {};
          const done = a.status === 'resolved' || a.status === 'false';
          const motion = s.type === 'motion';
          const tier = s.known ? s.type : motion ? 'motion' : 'unknown';

          return (
            <div key={a.id} className={`alert-row glass-panel ${done ? 'done' : ''}`} onClick={() => !motion && track(a)}
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
                <span className={`tag ${motion ? 'actioned' : tier}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{motion ? (lang ? 'لا يظهر وجه' : 'No face visible') : t(`face.${tier}`)}</span>{' '}
                <span className={`tag ${a.status}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{a.status.toUpperCase()}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'center' }}>
                  <span><Building2 size={12} style={{ verticalAlign: -1 }} /> {cam.building || (lang ? 'مبنى غير محدد' : 'No building')}</span>
                  <span><Cctv size={12} style={{ verticalAlign: -1 }} /> {cam.name}{cam.channel ? ` · CH${cam.channel}` : ''}</span>
                  <span className="mono"><Clock size={12} style={{ verticalAlign: -1 }} /> {formatWhen(a.when)}</span>
                  {!motion && <span><Gauge size={12} style={{ verticalAlign: -1 }} /> conf {a.conf}%</span>}
                </div>
                {a.log?.length > 1 && (
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{a.log.slice(1).map(l => `${l[1]} ${l[0]} ${formatWhen(l[2])}`).join(' → ')}</div>
                )}
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

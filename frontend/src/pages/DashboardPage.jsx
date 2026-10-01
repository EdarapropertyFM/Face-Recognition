import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import { useRealtime } from '../hooks/useRealtime';
import {
  Activity, ArrowRight, Bell, Building2, Camera, Cctv, CircleAlert, ClipboardList, Clock, ShieldAlert, Target, User, UserX, Users, WifiOff,
} from 'lucide-react';
import { displayName } from '../utils/display';
import { formatWhen } from './AlertsPage';
import { snapshotUrl } from '../utils/snapshot';
import { Columns } from '../components/Charts';

/**
 * The operator's screen. Ordered by what someone on shift has to do:
 * what needs attention right now, then who is being seen, then the shape
 * of the day. Everything is a real count from the API -- there are no
 * illustrative numbers on this page.
 */
export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const lang = i18n.language === 'ar' ? 1 : 0;

  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [today, setToday] = useState(null);

  const load = useCallback(() => {
    const get = (path) => apiFetch(path).then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))));
    get('/dashboard/summary').then(setSummary).catch(() => setSummary(null));
    get('/alerts').then(list => setAlerts(Array.isArray(list) ? list : [])).catch(() => setAlerts([]));
    get('/cameras').then(list => setCameras(Array.isArray(list) ? list : [])).catch(() => setCameras([]));
    get('/reports/analytics?days=1').then(setToday).catch(() => setToday(null));
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtime(() => load(), Boolean(session));

  const metrics = summary?.metrics;
  const owners = metrics?.ownersToday ?? 0;
  const strangers = metrics?.strangersToday ?? 0;
  const sightings = metrics?.sightingsToday ?? 0;
  const pending = metrics?.pendingEnrollments ?? 0;
  const recognition = metrics?.recognitionRate;
  const enrollmentStatus = today?.totals?.enrollments?.byStatus ?? {};
  const approved = enrollmentStatus.approved ?? 0;
  const rejected = enrollmentStatus.rejected ?? 0;
  const totalCameras = metrics?.totalCameras ?? 0;
  const onlineCameras = metrics?.onlineCameras ?? 0;

  const offline = cameras.filter(c => c.status !== 'online');
  // Alerts are notifications now, not cases, so "how many today" is the
  // number that means something -- there is no open/closed to count.
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const todayAlerts = alerts.filter(a => new Date(a.when) >= startOfToday);

  // Only things a person must act on. Alerts are not among them: they are
  // notifications that somebody was seen, and the count already has its own
  // tile -- repeating it here implied there was something to handle.
  const attention = [
    offline.length && {
      key: 'cams', tone: 'var(--amber)', icon: <WifiOff size={16} />,
      text: lang ? `${offline.length} كاميرا غير متصلة` : `${offline.length} camera${offline.length > 1 ? 's' : ''} offline`,
      to: '/cameras',
    },
    pending && {
      key: 'enroll', tone: 'var(--accent)', icon: <ClipboardList size={16} />,
      text: lang ? `${pending} طلب تسجيل بانتظار المراجعة` : `${pending} enrollment${pending > 1 ? 's' : ''} awaiting review`,
      to: '/enrollments',
    },
  ].filter(Boolean);

  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <div className="sub">{session?.role} · Security Tracking Management Community</div>
        </div>
      </div>

      {attention.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          {attention.map(item => (
            <button key={item.key} className="panel glass-panel" onClick={() => navigate(item.to)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer',
                border: `1px solid ${item.tone}`, borderRadius: 10, background: 'var(--stat-bg)',
                color: 'var(--txt)', fontSize: 13, fontWeight: 600, textAlign: 'start',
              }}>
              <span style={{ color: item.tone, display: 'flex' }}>{item.icon}</span>
              {item.text}
              <ArrowRight size={14} style={{ opacity: 0.6 }} />
            </button>
          ))}
        </div>
      )}

      <div className="kpis">
        <div className="kpi-card glass-panel" style={{ cursor: 'pointer' }} onClick={() => navigate('/cameras')}>
          <div className="kpi-header">
            <span className="kpi-icon blue"><Camera size={18} /></span>
            <div className="lab">{t('dashboard.cams_online')}</div>
          </div>
          <div className="kpi-body">
            <div className={`val ${offline.length ? 'r' : 'a'}`}>{onlineCameras}<span className="kpi-slash">/{totalCameras}</span></div>
            <div className="tr">{totalCameras - onlineCameras} offline</div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon green"><Users size={18} /></span>
            <div className="lab">{t('dashboard.owners_today')}</div>
          </div>
          <div className="kpi-body">
            <div className="val g">{owners}</div>
            <div className="tr">{t('dashboard.enrolled_matches')}</div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon amber"><UserX size={18} /></span>
            <div className="lab">{t('dashboard.strangers_today')}</div>
          </div>
          <div className="kpi-body">
            <div className="val m">{strangers}</div>
            <div className="tr">{t('dashboard.unenrolled_faces')}</div>
          </div>
        </div>

        <div className="kpi-card glass-panel" style={{ cursor: 'pointer' }} onClick={() => navigate('/alerts')}>
          <div className="kpi-header">
            <span className="kpi-icon amber"><Bell size={18} /></span>
            <div className="lab">{lang ? 'تنبيهات اليوم' : 'Alerts today'}</div>
          </div>
          <div className="kpi-body">
            <div className={`val ${todayAlerts.length ? 'm' : 'g'}`}>{todayAlerts.length}</div>
            <div className="tr">{alerts.length} {lang ? 'إجمالي' : 'in total'}</div>
          </div>
        </div>

        {/* Pending, approved and rejected in one card. As three separate
            tiles they pushed the row to eight and read as unrelated
            numbers, when they are three states of the same thing. */}
        <div className="kpi-card glass-panel kpi-split" style={{ cursor: 'pointer' }} onClick={() => navigate('/enrollments')}>
          <div className="kpi-header">
            <span className="kpi-icon amber"><ClipboardList size={18} /></span>
            <div className="lab">{lang ? 'التسجيلات' : 'Enrollments'}</div>
          </div>
          <div className="kpi-split-body">
            <div>
              <b className={pending ? 'm' : ''}>{pending}</b>
              <span>{lang ? 'قيد المراجعة' : 'pending'}</span>
            </div>
            <div>
              <b className="g">{approved}</b>
              <span>{lang ? 'معتمد' : 'approved'}</span>
            </div>
            <div>
              <b className={rejected ? 'r' : ''}>{rejected}</b>
              <span>{lang ? 'مرفوض' : 'rejected'}</span>
            </div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon blue"><Target size={18} /></span>
            <div className="lab">{t('dashboard.recognition_rate')}</div>
          </div>
          <div className="kpi-body">
            <div className={`val ${recognition === null || recognition === undefined ? 'a' : recognition >= 70 ? 'g' : recognition >= 40 ? 'm' : 'r'}`}>
              {recognition === null || recognition === undefined ? '—' : `${recognition}%`}
            </div>
            <div className="tr">{sightings} {lang ? 'رصدة اليوم' : 'detections today'}</div>
          </div>
        </div>
      </div>

      <div className="two" style={{ marginTop: 20 }}>
        {/* Live alerts, rendered from the enriched subject the API sends.
            The old version looked names up in a separate faces array and
            printed "face.undefined" for every stranger, which is most of them. */}
        <div className="panel glass-panel">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={18} color="var(--accent)" /> {t('nav.alerts')} — {lang ? 'مباشر' : 'live'}
            {todayAlerts.length > 0 && (
              <span className="tag new" style={{ marginInlineStart: 'auto' }}>{todayAlerts.length} {lang ? 'اليوم' : 'today'}</span>
            )}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {alerts.slice(0, 5).map(alert => {
              const subject = alert.subject ?? {};
              const cam = alert.camera ?? {};
              const motion = subject.type === 'motion';
              const tier = subject.known ? subject.type : motion ? 'motion' : 'unknown';
              return (
                <div key={alert.id} onClick={() => !motion && navigate(`/track?face=${encodeURIComponent(alert.face)}`)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px',
                    background: 'var(--stat-bg)', borderRadius: 8,
                    borderInlineStart: `3px solid ${tier === 'watch' ? 'var(--red)' : tier === 'unknown' ? 'var(--amber)' : 'var(--green)'}`,
                    cursor: motion ? 'default' : 'pointer',
                  }}>
                  <div className="face-th" style={{ width: 38, height: 38, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {alert.snapshot && alert.snapshotToken
                      ? <img src={snapshotUrl(alert.snapshot, alert.snapshotToken)} alt="" loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : motion ? <Activity size={17} color="var(--accent)" />
                      : tier === 'watch' ? <ShieldAlert size={17} color="var(--red)" />
                      : tier === 'unknown' ? <UserX size={17} color="var(--amber)" />
                      : <User size={17} color="var(--green)" />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <b style={{ fontSize: 13 }}>
                        {subject.known ? displayName(subject, lang, alert.face)
                          : motion ? (lang ? 'حركة' : 'Movement')
                          : (lang ? 'غريب' : 'Stranger')}
                      </b>
                      <span className={`tag ${motion ? 'actioned' : tier}`} style={{ fontSize: 10 }}>
                        {motion ? (lang ? 'لا وجه' : 'No face') : t(`face.${tier}`)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span><Cctv size={11} style={{ verticalAlign: -1 }} /> {cam.name || alert.cam}</span>
                      {cam.building && <span><Building2 size={11} style={{ verticalAlign: -1 }} /> {cam.building}</span>}
                      <span className="mono"><Clock size={11} style={{ verticalAlign: -1 }} /> {formatWhen(alert.when)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {!alerts.length && (
              <div className="hint" style={{ padding: '12px 0' }}>
                {lang ? 'لا توجد تنبيهات.' : 'No alerts yet.'}
              </div>
            )}
          </div>
          <button className="btn ghost sm" onClick={() => navigate('/alerts')} style={{ marginTop: 12 }}>
            {t('nav.alerts')} <ArrowRight size={13} />
          </button>
        </div>

        {/* Camera health. An offline camera is a blind spot, and the operator
            is the person who can get it looked at. */}
        <div className="panel glass-panel">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cctv size={18} color="var(--accent)" /> {lang ? 'حالة الكاميرات' : 'Camera health'}
            <span className={`tag ${offline.length ? 'watch' : 'closed'}`} style={{ marginInlineStart: 'auto' }}>
              {onlineCameras}/{totalCameras} {lang ? 'متصلة' : 'online'}
            </span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, maxHeight: 290, overflowY: 'auto' }}>
            {cameras.length ? [...cameras]
              .sort((a, b) => (a.status === 'online' ? 1 : 0) - (b.status === 'online' ? 1 : 0))
              .map(cam => (
                <div key={cam.id} onClick={() => navigate('/cameras')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                    background: 'var(--stat-bg)', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                  }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: cam.status === 'online' ? 'var(--green)' : 'var(--red)',
                  }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <b>{cam.displayName || cam.id}</b>
                    {cam.buildingCode ? <span style={{ color: 'var(--muted)' }}> · {cam.buildingCode}</span> : null}
                  </span>
                  {cam.status !== 'online'
                    ? <span style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CircleAlert size={12} /> {lang ? 'غير متصلة' : 'Offline'}
                      </span>
                    : <span className="mono" style={{ color: 'var(--muted)' }}>{cam.det ?? 0}</span>}
                </div>
              )) : <div className="hint">{lang ? 'لا توجد كاميرات.' : 'No cameras configured.'}</div>}
          </div>
        </div>
      </div>

      {today?.hourly && (
        <div className="panel glass-panel" style={{ marginTop: 20 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} color="var(--accent)" /> {lang ? 'نشاط اليوم حسب الساعة' : "Today's activity by hour"}
          </h3>
          <Columns data={today.hourly} xKey="hour" yKey="sightings"
            formatX={(hour) => String(hour).padStart(2, '0')}
            formatTip={(row) => `${String(row.hour).padStart(2, '0')}:00 — ${row.sightings} ${lang ? 'رصدة' : 'sightings'}`} />
        </div>
      )}

      {summary?.buildings?.length ? (
        <div className="panel glass-panel" style={{ marginTop: 20 }}>
          <h3><Building2 size={18} color="var(--green)" /> {t('nav.units')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {summary.buildings.map(b => (
              <div key={`${b.project}-${b.code}`} className="statcard" style={{ cursor: 'pointer' }} onClick={() => navigate('/units')}>
                <div className="l">{displayName(b, lang, b.code)}</div>
                <div className="sub" style={{ fontSize: 11 }}>{b.project}</div>
                <div className="v" style={{ fontSize: 20 }}>{b.enrolled}<span style={{ fontSize: 12, color: 'var(--muted)' }}>/{b.units}</span></div>
                {b.strangersToday > 0 && (
                  <div style={{ color: 'var(--amber)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <UserX size={11} /> {b.strangersToday} {lang ? 'غريب اليوم' : 'strangers today'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

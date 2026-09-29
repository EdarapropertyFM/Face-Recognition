import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ALERTS, FACES } from '../store';
import { apiFetch } from '../api';
import { useRealtime } from '../hooks/useRealtime';
import {
  Camera, Users, UserX, ClipboardList, Target, Building2, Bell
} from 'lucide-react';
import { displayName, zoneLabel } from '../utils/display';

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [summary, setSummary] = useState(null);
  const loadSummary = useCallback(() => apiFetch('/dashboard/summary').then(r => r.ok ? r.json() : Promise.reject()).then(setSummary).catch(() => setSummary(null)), []);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useRealtime(() => loadSummary(), Boolean(session));
  const metrics = summary?.metrics;
  const liveAlerts = summary?.alerts ?? ALERTS;
  const liveFaces = summary?.faces ?? FACES;
  const liveBuildings = summary?.buildings ?? [];

  // Counted from real sightings since midnight. These used to come from a
  // hard-coded demo array multiplied by 61, which is how a community with
  // three enrolled faces reported 610 owners seen today.
  const owners = metrics?.ownersToday ?? 0;
  const strangers = metrics?.strangersToday ?? 0;
  const sightings = metrics?.sightingsToday ?? 0;
  const pending = metrics?.pendingEnrollments ?? 0;
  const enrolled = metrics?.enrolledPeople ?? 0;
  const recognition = metrics?.recognitionRate;      // null when nobody seen yet
  const totalCameras = metrics?.totalCameras ?? 0;
  const onlineCameras = metrics?.onlineCameras ?? 0;

  return (
    <>
      <div className="ph">
        <div>
          <h1>{t('dashboard.title')}</h1>
          <div className="sub">{session?.role} · Security Tracking Management Community</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpis">
        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon blue"><Camera size={18} /></span>
            <div className="lab">{t('dashboard.cams_online')}</div>
          </div>
          <div className="kpi-body">
            <div className="val a">{onlineCameras}<span className="kpi-slash">/{totalCameras}</span></div>
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

        {/* Replaces the watchlist tile, which belongs to phase 2. This one
            is actionable: a pending registration is somebody waiting on an
            admin, and it is the only number here that needs a human. */}
        <div className="kpi-card glass-panel" style={{ cursor: 'pointer' }} onClick={() => navigate('/enrollments')}>
          <div className="kpi-header">
            <span className="kpi-icon amber"><ClipboardList size={18} /></span>
            <div className="lab">{t('dashboard.pending_enrollments')}</div>
          </div>
          <div className="kpi-body">
            <div className={`val ${pending ? 'm' : 'g'}`}>{pending}</div>
            <div className="tr">{enrolled} {t('dashboard.people_enrolled')}</div>
          </div>
        </div>

        {/* Replaces the banned tile. The share of people the cameras could
            actually identify is the most honest measure of whether
            recognition is working, and it is the number that moves when
            enrolment or camera placement improves. */}
        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon blue"><Target size={18} /></span>
            <div className="lab">{t('dashboard.recognition_rate')}</div>
          </div>
          <div className="kpi-body">
            <div className={`val ${recognition === null || recognition === undefined ? 'a' : recognition >= 70 ? 'g' : recognition >= 40 ? 'm' : 'r'}`}>
              {recognition === null || recognition === undefined ? '—' : `${recognition}%`}
            </div>
            <div className="tr">{sightings} {t('dashboard.sightings_today')}</div>
          </div>
        </div>
      </div>

      <div className="two">
        {/* Alerts panel */}
        <div className="panel glass-panel">
          <h3><Bell size={18} color="var(--accent)" /> {t('nav.alerts')} — live</h3>
          {liveAlerts.slice(0, 3).map(a => {
            const f = liveFaces.find(x => x.id === a.face);
            return (
              <div key={a.id} className={`alert-row ${a.status === 'resolved' ? 'done' : ''}`}>
                <div className="face-th">{f?.type === 'watch' ? '⛔' : f?.type === 'unknown' ? '❓' : '👤'}</div>
                <div className="meta">
                  <b>{displayName(f, lang, a.face)}</b> <span className={`tag ${f?.type}`}>{t(`face.${f?.type}`)}</span>{' '}
                  <span className={`tag ${a.status}`}>{a.status.toUpperCase()}</span>
                  <div>{a.cam} · {zoneLabel(a.zone, lang)} · {a.when} · conf {a.conf}%</div>
                </div>
              </div>
            );
          })}
          <button className="btn ghost sm" onClick={() => navigate('/alerts')} style={{ marginTop: 10 }}>
            {t('nav.alerts')} →
          </button>
        </div>

      </div>

      {/* Buildings mini overview */}
      <div className="panel glass-panel" style={{ marginTop: 22 }}>
        <h3><Building2 size={18} color="var(--green)" /> {t('nav.units')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {liveBuildings.map(b => (
            <div key={`${b.project}-${b.code}`} className="statcard" style={{ cursor: 'pointer' }} onClick={() => navigate('/units')}>
              <div className="l">{displayName(b, lang, b.code)}</div>
              <div className="sub" style={{ fontSize: 11 }}>{b.project}</div>
              <div className="v" style={{ fontSize: 20 }}>{b.enrolled}<span style={{ fontSize: 12, color: 'var(--muted)' }}>/{b.units}</span></div>
              {b.strangersToday > 0 && <div style={{ color: 'var(--red)', fontSize: 11 }}>⚠ {b.strangersToday} strangers</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="note" style={{ marginTop: 16 }}>
        🔒 <b>Owner</b> = enrolled + consented, matched like LPR plates. <b>Stranger</b> = anonymous track-ID, no identity, auto-purged after 90d. <b>Watchlist</b> = banned → alert on sight.
      </div>
    </>
  );
}

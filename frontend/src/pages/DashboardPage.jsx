import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  CAMERAS_ONLINE, CAMERAS_TOTAL,
  DETECTIONS, ALERTS, INCIDENTS, FACES, ZONES
} from '../store';
import { apiFetch } from '../api';
import { useRealtime } from '../hooks/useRealtime';
import { 
  Camera, Users, UserX, UserMinus, ShieldAlert, AlertTriangle, Building2, Bell, FileText
} from 'lucide-react';

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
  const liveIncidents = summary?.incidents ?? INCIDENTS;
  const liveFaces = summary?.faces ?? FACES;
  const liveBuildings = summary?.buildings ?? [];

  const owners       = DETECTIONS.filter(d => d.type === 'known' || d.type === 'staff').length;
  const strangers    = DETECTIONS.filter(d => d.type === 'unknown').length;
  const watchHits    = DETECTIONS.filter(d => d.type === 'watch').length;
  const openInc      = metrics?.openIncidents ?? INCIDENTS.filter(i => i.status !== 'closed').length;
  const banned       = metrics?.watchlist ?? FACES.filter(f => f.type === 'watch').length;
  const totalCameras = metrics?.totalCameras ?? CAMERAS_TOTAL;
  const onlineCameras = metrics?.onlineCameras ?? CAMERAS_ONLINE;

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
            <div className="val g">{owners * 61}</div>
            <div className="tr">{t('dashboard.enrolled_matches')}</div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon amber"><UserX size={18} /></span>
            <div className="lab">{t('dashboard.strangers_today')}</div>
          </div>
          <div className="kpi-body">
            <div className="val m">{strangers * 61}</div>
            <div className="tr">{t('dashboard.unenrolled_faces')}</div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon red"><ShieldAlert size={18} /></span>
            <div className="lab">{t('dashboard.watchlist_hits')}</div>
          </div>
          <div className="kpi-body">
            <div className="val r">{watchHits * 4}</div>
            <div className="tr">Immediate review needed</div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon amber"><AlertTriangle size={18} /></span>
            <div className="lab">{t('dashboard.open_incidents')}</div>
          </div>
          <div className="kpi-body">
            <div className="val m">{openInc}</div>
            <div className="tr">Requires action</div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-header">
            <span className="kpi-icon red"><UserMinus size={18} /></span>
            <div className="lab">{t('dashboard.banned')}</div>
          </div>
          <div className="kpi-body">
            <div className="val r">{banned}</div>
            <div className="tr">Total on list</div>
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
                  <b>{f?.name[lang]}</b> <span className={`tag ${f?.type}`}>{t(`face.${f?.type}`)}</span>{' '}
                  <span className={`tag ${a.status}`}>{a.status.toUpperCase()}</span>
                  <div>{a.cam} · {ZONES[a.zone][lang]} · {a.when} · conf {a.conf}%</div>
                </div>
              </div>
            );
          })}
          <button className="btn ghost sm" onClick={() => navigate('/alerts')} style={{ marginTop: 10 }}>
            {t('nav.alerts')} →
          </button>
        </div>

        {/* Incidents panel */}
        <div className="panel glass-panel">
          <h3><FileText size={18} color="var(--amber)" /> {t('nav.incidents')} — recent</h3>
          <table>
            <thead><tr><th>ID</th><th>SEF</th><th>Face</th><th>Status</th></tr></thead>
            <tbody>
              {liveIncidents.slice(0, 4).map(i => (
                <tr key={i.id} onClick={() => navigate('/incidents')} style={{ cursor: 'pointer' }}>
                  <td className="mono">{i.id}</td>
                  <td><span className="sefbadge">{i.sef}</span></td>
                  <td className="mono">{i.face}</td>
                  <td><span className={`tag ${i.status}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Buildings mini overview */}
      <div className="panel glass-panel" style={{ marginTop: 22 }}>
        <h3><Building2 size={18} color="var(--green)" /> {t('nav.buildings')} — WTR overview</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {liveBuildings.map(b => (
            <div key={b.code} className="statcard" style={{ cursor: 'pointer' }} onClick={() => navigate('/buildings')}>
              <div className="l">{b.name[lang]}</div>
              <div className="v" style={{ fontSize: 20 }}>{b.enrolled}<span style={{ fontSize: 12, color: 'var(--muted)' }}>/{b.units}</span></div>
              {b.strangersToday > 0 && <div style={{ color: 'var(--red)', fontSize: 11 }}>⚠ {b.strangersToday} strangers</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="note" style={{ marginTop: 16 }}>
        🔒 <b>Owner</b> = enrolled + consented, matched like LPR plates. <b>Stranger</b> = anonymous track-ID, no identity, auto-purged 90d unless incident-linked. <b>Watchlist</b> = banned → alert on sight.
      </div>
    </>
  );
}

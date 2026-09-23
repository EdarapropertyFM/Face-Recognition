import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, ShieldAlert, UserX, User, Info, CheckCircle2, Crosshair } from 'lucide-react';
import { ALERTS, FACES, ZONES } from '../store';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import { useRealtime } from '../hooks/useRealtime';

const LIFECYCLE = ['new','ack','actioned','resolved','false'];

export default function AlertsPage() {
  const { t, i18n } = useTranslation();
  const { canEdit, session } = useAuth();
  const navigate = useNavigate();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [alerts, setAlerts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadAlerts = useCallback(() => apiFetch('/alerts')
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(setAlerts)
    .catch(() => setAlerts(ALERTS)), []);
  useEffect(() => { loadAlerts(); }, [loadAlerts]);
  useRealtime((event) => {
    if (event.type.startsWith('alert.') || event.type === 'incident.created') loadAlerts();
  }, Boolean(session));

  const filtered = alerts.filter(a =>
    (statusFilter === 'all' || a.status === statusFilter) &&
    (a.face + a.cam).toLowerCase().includes(search.toLowerCase())
  );
  const newCount = alerts.filter(a => a.status === 'new').length;

  const step = async (id, to) => {
    const res = await apiFetch(`/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: to, actor: session.user }) });
    if (res.ok) await loadAlerts();
  };

  const createIncident = async (alert) => {
    const res = await apiFetch('/incidents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertId: alert.id, sef: 'SEF-01-20', title: ['Security alert investigation', 'تحقيق في تنبيه أمني'], face: alert.face, zone: alert.zone, when: alert.when, officer: [session.user, session.user], desc: [`Created from alert ${alert.id}.`, `تم إنشاؤها من التنبيه ${alert.id}.`] }),
    });
    if (res.ok) { await loadAlerts(); navigate('/incidents'); }
  };

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
          <span style={{ opacity: 0.7 }}>{lang ? 'كل خطوة مسجّلة للتدقيق.' : 'Every step is audit-logged.'}</span>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="search">
          <input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All status</option>
          {LIFECYCLE.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length ? filtered.map(a => {
          const f = FACES.find(x => x.id === a.face);
          const done = a.status === 'resolved' || a.status === 'false';
          const editable = canEdit('alerts');

          let actions = null;
          if (editable && !done) {
            if (a.status === 'new')      actions = <button className="btn sm" onClick={() => step(a.id, 'ack')}>Ack</button>;
            if (a.status === 'ack')      actions = <><button className="btn sm" onClick={() => navigate('/track')}>Track</button><button className="btn sm" onClick={() => step(a.id, 'actioned')}>Action</button></>;
            if (a.status === 'actioned') actions = <><button className="btn sm red" onClick={() => createIncident(a)}>Incident</button><button className="btn sm" onClick={() => step(a.id, 'resolved')}>Resolve</button></>;
          }

          return (
            <div key={a.id} className={`alert-row glass-panel ${done ? 'done' : ''}`} style={{ padding: '12px 16px', borderLeftWidth: 4, borderRadius: 8 }}>
              <div className="face-th" style={{ borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44 }}>
                {f?.type === 'watch' ? <ShieldAlert size={20} color="var(--red)" /> : 
                 f?.type === 'unknown' ? <UserX size={20} color="var(--amber)" /> : 
                 <User size={20} color="var(--green)" />}
              </div>
              <div className="meta">
                <b style={{ fontSize: 14 }}>{f?.name[lang] || a.face}</b>{' '}
                <span className={`tag ${f?.type}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{t(`face.${f?.type}`)}</span>{' '}
                <span className={`tag ${a.status}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{a.status.toUpperCase()}</span>
                <div>{a.cam} · {ZONES[a.zone][lang]} · {a.when} · conf {a.conf}%
                  {a.log?.length > 0 && <> · {a.log.map(l => `${l[1]} ${l[2]}`).join(' → ')}</>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                {actions}
                {editable && !done && <button className="btn ghost sm" style={{ padding: '6px 12px' }} onClick={() => step(a.id, 'false')}>False</button>}
              </div>
            </div>
          );
        }) : <div className="sub" style={{ padding: 20 }}>No alerts in range</div>}
      </div>
    </>
  );
}

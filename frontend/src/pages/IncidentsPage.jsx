import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, AlertTriangle, Paperclip, User } from 'lucide-react';
import { INCIDENTS, SEF_FORMS, ZONES } from '../store';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import { useRealtime } from '../hooks/useRealtime';

const STATUS_COLORS = { open: 'open', review: 'unknown', closed: 'closed' };

export default function IncidentsPage() {
  const { t, i18n } = useTranslation();
  const { canEdit } = useAuth();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [incidents, setIncidents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sefFilter, setSefFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);

  const loadIncidents = useCallback(() => apiFetch('/incidents')
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(setIncidents)
    .catch(() => setIncidents(INCIDENTS)), []);
  useEffect(() => { loadIncidents(); }, [loadIncidents]);
  useRealtime((event) => {
    if (event.type.startsWith('incident.')) loadIncidents();
  });

  const filtered = incidents.filter(i =>
    (statusFilter === 'all' || i.status === statusFilter) &&
    (sefFilter === 'all' || i.sef === sefFilter) &&
    (i.id + i.title[0] + i.title[1] + (i.face || '')).toLowerCase().includes(search.toLowerCase())
  );

  const rec = viewing ? incidents.find(i => i.id === viewing) : null;

  const closeIncident = async (id) => {
    const res = await apiFetch(`/incidents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'closed' }) });
    if (res.ok) await loadIncidents();
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1><AlertTriangle size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.incidents')}</h1>
          <div className="sub">{lang ? 'دورة الإجراءات الأمنية · نماذج SEF' : 'security action cycle · SEF forms'}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search"><Search size={14} /><input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select value={sefFilter} onChange={e => setSefFilter(e.target.value)}>
          <option value="all">{lang ? 'كل النماذج' : 'All SEF'}</option>
          {Object.keys(SEF_FORMS).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All status</option>
          {['open','review','closed'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="grow" />
        {canEdit('incidents') && (
          <button className="btn"><Plus size={14} /> {lang ? 'واقعة جديدة' : 'New Incident'}</button>
        )}
      </div>

      <div className="panel glass-panel" style={{ padding: 0, overflowX: 'auto', border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>SEF Form</th>
              <th>{lang ? 'العنوان' : 'Title'}</th>
              <th><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><User size={14} color="var(--muted)" /> Face</div></th>
              <th><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Paperclip size={14} color="var(--muted)" /> {lang ? 'المرفقات' : 'Attachments'}</div></th>
              <th>{lang ? 'وقت الواقعة' : 'When'}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i.id} onClick={() => setViewing(i.id)} style={{ cursor: 'pointer', transition: '0.2s' }}>
                <td className="mono" style={{ color: '#fff' }}>{i.id}</td>
                <td>
                  <span className="sefbadge" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{i.sef}</span><br />
                  <span className="mono" style={{ fontSize: 10, opacity: 0.6 }}>{SEF_FORMS[i.sef]?.[lang]}</span>
                </td>
                <td><b>{i.title[lang]}</b></td>
                <td className="mono" style={{ color: 'var(--muted)' }}>{i.face || '—'}</td>
                <td>
                  {i.att?.length ? <span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Paperclip size={12} color="var(--accent)" /> {i.att.length}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{i.when.replace('T', ' ')}</td>
                <td><span className={`tag ${STATUS_COLORS[i.status]}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {rec && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setViewing(null)}>
          <div className="modal">
            <div className="mh">
              <span className="sefbadge">{rec.sef}</span>
              <h3>{rec.id} — {rec.title[lang]}</h3>
              <span className="x" onClick={() => setViewing(null)}>×</span>
            </div>
            <div className="mb">
              <div className="frow">
                <div className="fg"><label>Status</label><div style={{ marginTop: 4 }}><span className={`tag ${STATUS_COLORS[rec.status]}`} style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{rec.status}</span></div></div>
                <div className="fg"><label>Face</label><div className="mono" style={{ color: 'var(--txt)', fontSize: 13, background: 'var(--stat-bg)', padding: '6px 12px', borderRadius: 8, display: 'inline-block' }}>{rec.face || '—'}</div></div>
                <div className="fg"><label>Zone</label><div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{ZONES[rec.zone]?.[lang]}</div></div>
                <div className="fg"><label>When</label><div className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{rec.when.replace('T', ' ')}</div></div>
                <div className="fg"><label>Officer</label><div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{rec.officer?.[lang]}</div></div>
                <div className="fg"><label>SEF Form</label><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="sefbadge" style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{rec.sef}</span> <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{SEF_FORMS[rec.sef]?.[lang]}</span></div></div>
              </div>
              <div className="fg">
                <label>{lang ? 'الوصف' : 'Description'}</label>
                <div style={{ padding: '12px 16px', color: 'var(--txt)', lineHeight: 1.6, background: 'var(--stat-bg)', borderRadius: 12, border: '1px solid var(--glass-border)' }}>{rec.desc?.[lang]}</div>
              </div>
              <div className="fg">
                <label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><Paperclip size={14} color="var(--accent)" /> {lang ? 'المرفقات' : 'Attachments'} ({rec.att?.length || 0})</div></label>
                {rec.att?.length ? rec.att.map((a, i) => <div key={i} style={{ padding: '6px 12px', background: 'var(--stat-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><Paperclip size={14} color="var(--muted)" /> {a}</div>) : <div className="hint">None</div>}
              </div>
            </div>
            <div className="mf">
              {rec.status !== 'closed' && canEdit('incidents') && (
                <button className="btn red" onClick={() => { closeIncident(rec.id); setViewing(null); }}>
                  {lang ? 'إغلاق الواقعة' : 'Close Incident'}
                </button>
              )}
              <button className="btn ghost" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

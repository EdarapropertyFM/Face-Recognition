import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Download, Users, ShieldAlert, UserX, User, Info } from 'lucide-react';
import { DETECTIONS } from '../store'; // Detections still mock for now
import { apiFetch } from '../api';

export default function FaceDBPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [FACES, setFaces] = useState([]);

  useEffect(() => {
    apiFetch('/faces')
      .then(res => res.json())
      .then(data => setFaces(data))
      .catch(err => console.error(err));
  }, []);

  const filtered = FACES.filter(f => {
    const bucket = (f.type === 'known' || f.type === 'staff') ? 'owner' : f.type === 'unknown' ? 'stranger' : 'watch';
    const matches = filter === 'all' || filter === bucket || filter === f.type;
    
    const nameStr = Array.isArray(f.name) ? f.name.join(' ') : (f.name || '');
    const roleStr = Array.isArray(f.role) ? f.role.join(' ') : (f.role || '');
    
    const q = (f.id + nameStr + (f.idno || '') + roleStr).toLowerCase();
    return matches && q.includes(search.toLowerCase());
  });

  const detCount = (fid) => DETECTIONS.filter(d => d.face === fid).length;

  return (
    <>
      <div className="ph">
        <div>
          <h1><Users size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.facedb')}</h1>
          <div className="sub">{FACES.length} {lang ? 'وجوه · المالك مقابل الغريب' : 'faces · Owner vs Stranger'}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search">
          <Search size={14} />
          <input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">{lang ? 'الكل' : 'All'}</option>
          <option value="owner">👤 {lang ? 'الملاك' : 'Owners'}</option>
          <option value="staff">{lang ? 'الموظفون' : 'Staff'}</option>
          <option value="stranger">❓ {lang ? 'الغرباء' : 'Strangers'}</option>
          <option value="watch">⛔ {lang ? 'قائمة المنع' : 'Watchlist'}</option>
        </select>
        <div className="grow" />
        <button className="btn"><UserPlus size={14} /> {lang ? 'تسجيل وجه' : 'Enroll Face'}</button>
        <button className="btn ghost sm"><Download size={14} /> Export CSV</button>
      </div>

      <div className="panel glass-panel" style={{ padding: 0, overflowX: 'auto', border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Face ID</th>
              <th>{lang ? 'الاسم' : 'Name'}</th>
              <th>Tier</th>
              <th>ID/Card</th>
              <th>{lang ? 'الاكتشافات' : 'Detections'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id} style={{ transition: '0.2s' }}>
                <td>
                  <span className="face-th" style={{ borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}>
                    {f.type === 'watch' ? <ShieldAlert size={18} color="var(--red)" /> : 
                     f.type === 'unknown' ? <UserX size={18} color="var(--amber)" /> : 
                     <User size={18} color="var(--green)" />}
                  </span>
                </td>
                <td className="mono" style={{ color: '#fff' }}>{f.id}</td>
                <td>
                  <b>{f.name[lang]}</b><br />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{f.role[lang]}</span>
                </td>
                <td><span className={`tag ${f.type}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{t(`face.${f.type}`)}</span></td>
                <td className="mono" style={{ color: 'var(--muted)' }}>{f.idno || '—'}</td>
                <td><span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>{detCount(f.id)}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => navigate('/track')}>Track</button>
                    {f.type === 'unknown' && <button className="btn sm">Identify</button>}
                    {(f.type === 'unknown' || f.type === 'known') && (
                      <button className="btn red sm" onClick={() => navigate('/incidents')}>Ban</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel glass-panel" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
        <Info size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          Ban → generates <span className="sefbadge">SEF-01-02</span>, moves face to Watchlist, queues access-control deny rule.
        </div>
      </div>
    </>
  );
}

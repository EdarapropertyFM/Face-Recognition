import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, UserPlus, Shield, Users, Lock, Eye, Edit2, X, Info } from 'lucide-react';
import { USERS, ROLES } from '../store';
import { displayName } from '../utils/display';

const MODULES = ['dashboard','livewall','cameras','buildings','enrollments','alerts','track','facedb','reports','admin','settings'];
const ROLE_LIST = Object.keys(ROLES);

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [users, setUsers] = useState(USERS);
  const [search, setSearch] = useState('');

  const filtered = users.filter(u =>
    (u.u + u.name[0] + u.name[1] + u.role).toLowerCase().includes(search.toLowerCase())
  );

  const setRole = (uu, role) => setUsers(us => us.map(u => u.u === uu ? { ...u, role } : u));

  return (
    <>
      <div className="ph">
        <div>
          <h1><Shield size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.admin')}</h1>
          <div className="sub">{lang ? 'المستخدمون · الأدوار · الصلاحيات' : 'users · roles · permissions'}</div>
        </div>
      </div>

      <div className="two">
        {/* Users table */}
        <div className="panel glass-panel">
          <h3><Users size={18} color="var(--accent)" /> {lang ? 'المستخدمون' : 'Users'}</h3>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="search"><Search size={14} /><input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div className="grow" />
            <button className="btn" onClick={() => alert('Demo: add user form')}>
              <UserPlus size={14} /> {lang ? 'إضافة مستخدم' : 'Add user'}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>{lang ? 'اسم المستخدم' : 'User'}</th>
                <th>{lang ? 'الاسم' : 'Name'}</th>
                <th>{lang ? 'الدور' : 'Role'}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.u} style={{ transition: '0.2s' }}>
                  <td className="mono" style={{ color: 'var(--muted)' }}>{u.u}</td>
                  <td style={{ color: 'var(--txt)', fontWeight: 600 }}>{displayName(u, lang, u.u)}</td>
                  <td>
                    <select value={u.role} onChange={e => setRole(u.u, e.target.value)} style={{ background: 'var(--stat-bg)', border: '1px solid var(--glass-border)', color: 'var(--txt)', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}>
                      {ROLE_LIST.map(r => <option key={r} style={{ background: 'var(--bg2)' }}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`tag ${u.status === 'active' ? 'online' : 'offline'}`} style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{u.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Permission matrix */}
        <div className="panel glass-panel">
          <h3><Lock size={18} color="var(--accent)" /> {lang ? 'مصفوفة الصلاحيات' : 'Permission matrix'}</h3>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table className="permtbl" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: 12 }}>{lang ? 'القسم' : 'Module'}</th>
                  {ROLE_LIST.map(r => <th key={r} style={{ paddingBottom: 12, textAlign: 'center', color: 'var(--txt)' }}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULES.map(mod => (
                  <tr key={mod} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 0', fontWeight: 600, color: 'var(--muted)' }}>{t(`nav.${mod}`, mod)}</td>
                    {ROLE_LIST.map(r => {
                      const v = ROLES[r].view.includes(mod);
                      const e = ROLES[r].edit.includes(mod);
                      return (
                        <td key={r} style={{ textAlign: 'center', padding: '10px 0' }}>
                          {v ? (
                            e ? <span style={{ display: 'inline-flex', padding: '4px', background: 'rgba(46,204,113,0.15)', borderRadius: 6, color: 'var(--green)', border: '1px solid rgba(46,204,113,0.2)' }} title="Edit/View"><Edit2 size={14} /></span> 
                              : <span style={{ display: 'inline-flex', padding: '4px', background: 'rgba(0,164,196,0.15)', borderRadius: 6, color: 'var(--accent)', border: '1px solid rgba(0,164,196,0.2)' }} title="View Only"><Eye size={14} /></span>
                          ) : (
                            <span style={{ display: 'inline-flex', padding: '4px', opacity: 0.3, color: 'var(--muted)' }} title="No Access"><X size={14} /></span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="panel glass-panel" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', border: 'none' }}>
            <Info size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Edit2 size={12} color="var(--green)" /> Edit & View</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Eye size={12} color="var(--accent)" /> View Only</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={12} opacity={0.5} /> None</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircleAlert, Edit2, Eye, EyeOff, Layers, LoaderCircle, Lock, RotateCcw, Search, Shield, Trash2, UserCheck, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import { ROLES } from '../store';
import { apiFetch } from '../api';
import { displayName } from '../utils/display';
import ProjectsPanel from '../components/admin/ProjectsPanel';

const MODULES = ['dashboard','livewall','cameras','units','enrollments','alerts','track','facedb','reports','facetest','admin','settings'];
const ROLE_LIST = Object.keys(ROLES);

/** none -> view -> edit -> none. Editing implies viewing, as on the server. */
const NEXT_LEVEL = { none: 'view', view: 'edit', edit: 'none' };

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('users');
  const [matrix, setMatrix] = useState(null);     // { modules, locked, roles[] }
  const [savingRole, setSavingRole] = useState('');

  const loadMatrix = useCallback(() => apiFetch('/roles')
    .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(setMatrix)
    .catch(() => setMatrix(null)), []);
  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  /** Cycles one cell and persists the whole role in one request. */
  const cyclePermission = async (role, mod) => {
    if (!matrix || role === matrix.locked) return;
    const row = matrix.roles.find((entry) => entry.role === role);
    if (!row) return;
    const level = row.edit.includes(mod) ? 'edit' : row.view.includes(mod) ? 'view' : 'none';
    const next = NEXT_LEVEL[level];

    const view = new Set(row.view);
    const edit = new Set(row.edit);
    if (next === 'none') { view.delete(mod); edit.delete(mod); }
    if (next === 'view') { view.add(mod); edit.delete(mod); }
    if (next === 'edit') { view.add(mod); edit.add(mod); }

    setSavingRole(role);
    const res = await apiFetch(`/roles/${encodeURIComponent(role)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view: [...view], edit: [...edit] }),
    });
    setSavingRole('');
    if (res.ok) {
      await loadMatrix();
      // Anyone signed in with this role should feel it without re-logging.
      window.dispatchEvent(new Event('stmc:roles-changed'));
    } else {
      alert(await problem(res, lang ? 'تعذر تحديث الصلاحيات.' : 'Could not update permissions.'));
    }
  };

  const resetRole = async (role) => {
    if (!window.confirm(lang
      ? `إعادة «${role}» إلى الصلاحيات الافتراضية؟`
      : `Reset "${role}" to its default permissions?`)) return;
    setSavingRole(role);
    const res = await apiFetch(`/roles/${encodeURIComponent(role)}/reset`, { method: 'POST' });
    setSavingRole('');
    if (res.ok) { await loadMatrix(); window.dispatchEvent(new Event('stmc:roles-changed')); }
    else alert(await problem(res, lang ? 'تعذر الإرجاع.' : 'Could not reset.'));
  };
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ u: '', name: '', role: 'Operator', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  const loadUsers = useCallback(() => apiFetch('/users')
    .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(list => { setUsers(Array.isArray(list) ? list : []); setLoadError(''); })
    .catch(err => setLoadError(err.message)), []);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = users.filter(u =>
    [u.u, ...(u.name ?? []), u.role].join(' ').toLowerCase().includes(search.toLowerCase())
  );

  const problem = async (res, fallback) => {
    const body = await res.json().catch(() => ({}));
    return [body.message].flat().filter(Boolean).join(' ') || fallback;
  };

  /** Role and status changes persist; they used to live only in local state. */
  const patchUser = async (username, patch) => {
    const res = await apiFetch(`/users/${encodeURIComponent(username)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (res.ok) await loadUsers();
    else alert(await problem(res, lang ? 'تعذر تحديث المستخدم.' : 'Could not update this user.'));
  };

  const deleteUser = async (user) => {
    if (!window.confirm(lang
      ? `حذف المستخدم «${user.u}» نهائياً؟`
      : `Permanently delete "${user.u}"? This cannot be undone.`)) return;
    const res = await apiFetch(`/users/${encodeURIComponent(user.u)}`, { method: 'DELETE' });
    if (res.ok) await loadUsers();
    else alert(await problem(res, lang ? 'تعذر حذف المستخدم.' : 'Could not delete this user.'));
  };

  const addUser = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError('');
    const res = await apiFetch('/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        u: form.u.trim().toLowerCase(),
        // The API stores [English, Arabic]; one name is used for both.
        name: [form.name.trim(), form.name.trim()],
        role: form.role,
        password: form.password,
      }),
    });
    setSaving(false);
    if (res.ok) {
      await loadUsers();
      setAdding(false);
      setForm({ u: '', name: '', role: 'Operator', password: '' });
      setShowPassword(false);
    } else {
      setFormError(await problem(res, lang ? 'تعذر إنشاء المستخدم.' : 'Could not create this user.'));
    }
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1><Shield size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.admin')}</h1>
          <div className="sub">{lang ? 'المستخدمون · الأدوار · الصلاحيات · المشاريع' : 'users · roles · permissions · projects'}</div>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 18 }}>
        <span className={`chip ${tab === 'users' ? 'on' : ''}`} onClick={() => setTab('users')}>
          <Users size={13} /> {lang ? 'المستخدمون والصلاحيات' : 'Users & permissions'}
        </span>
        <span className={`chip ${tab === 'places' ? 'on' : ''}`} onClick={() => setTab('places')}>
          <Layers size={13} /> {lang ? 'المشاريع والمباني' : 'Projects & buildings'}
        </span>
      </div>

      {tab === 'places' ? <ProjectsPanel lang={lang} /> : <>
      <div className="two">
        {/* Users table */}
        <div className="panel glass-panel">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} color="var(--accent)" /> {lang ? 'المستخدمون' : 'Users'}
            <span className="tag closed" style={{ marginInlineStart: 'auto' }}>
              {users.filter(u => u.status === 'active').length}/{users.length} {lang ? 'نشط' : 'active'}
            </span>
          </h3>
          <div className="toolbar" style={{ marginBottom: 16 }}>
            <div className="search"><Search size={14} /><input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div className="grow" />
            <button className="btn" onClick={() => { setAdding(true); setFormError(''); setShowPassword(false); }}>
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
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.u} style={{ transition: '0.2s' }}>
                  <td className="mono" style={{ color: 'var(--muted)' }}>{u.u}</td>
                  <td style={{ color: 'var(--txt)', fontWeight: 600 }}>{displayName(u, lang, u.u)}</td>
                  <td>
                    <select value={u.role} onChange={e => patchUser(u.u, { role: e.target.value })} style={{ background: 'var(--stat-bg)', border: '1px solid var(--glass-border)', color: 'var(--txt)', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}>
                      {ROLE_LIST.map(r => <option key={r} style={{ background: 'var(--bg2)' }}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className={`tag ${u.status === 'active' ? 'online' : 'offline'}`}
                      style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                      {u.status === 'active' ? (lang ? 'نشط' : 'active') : (lang ? 'موقوف' : 'disabled')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn ghost sm"
                        title={u.status === 'active'
                          ? (lang ? 'إيقاف الحساب' : 'Deactivate — blocks sign-in, keeps the account')
                          : (lang ? 'تفعيل الحساب' : 'Activate')}
                        onClick={() => patchUser(u.u, { status: u.status === 'active' ? 'disabled' : 'active' })}>
                        {u.status === 'active' ? <UserMinus size={13} /> : <UserCheck size={13} />}
                      </button>
                      <button className="btn ghost sm" title={lang ? 'حذف نهائي' : 'Delete permanently'}
                        onClick={() => deleteUser(u)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={5} className="sub" style={{ padding: 14 }}>
                  {loadError
                    ? (lang ? 'تعذر تحميل المستخدمين: ' : 'Could not load users: ') + loadError
                    : (lang ? 'لا يوجد مستخدمون.' : 'No users.')}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Permission matrix */}
        <div className="panel glass-panel">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={18} color="var(--accent)" /> {lang ? 'مصفوفة الصلاحيات' : 'Permission matrix'}
          </h3>
          <p className="sub" style={{ marginTop: -6, marginBottom: 12, fontSize: 12 }}>
            {lang
              ? 'اضغط أي خانة للتبديل: بدون ← عرض ← تعديل. يُحفظ فوراً.'
              : 'Click any cell to cycle: none → view → edit. Saved immediately.'}
          </p>

          {!matrix ? (
            <div className="sub"><LoaderCircle size={14} /> {lang ? 'جاري التحميل…' : 'Loading…'}</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                <table className="permtbl" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'start', paddingBottom: 8 }}>{lang ? 'القسم' : 'Module'}</th>
                      {matrix.roles.map((row) => (
                        <th key={row.role} style={{ paddingBottom: 8, textAlign: 'center', color: 'var(--txt)' }}>
                          {row.role}
                          {row.role === matrix.locked && (
                            <Lock size={10} style={{ marginInlineStart: 4, opacity: 0.6, verticalAlign: 0 }} />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((mod) => (
                      <tr key={mod} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '4px 0', fontWeight: 600, color: 'var(--muted)', fontSize: 11.5 }}>{t(`nav.${mod}`, mod)}</td>
                        {matrix.roles.map((row) => {
                          const canEditIt = row.edit.includes(mod);
                          const canSeeIt = row.view.includes(mod);
                          const locked = row.role === matrix.locked;
                          const label = canEditIt ? (lang ? 'تعديل وعرض' : 'Edit & view')
                            : canSeeIt ? (lang ? 'عرض فقط' : 'View only')
                            : (lang ? 'بدون صلاحية' : 'No access');
                          return (
                            <td key={row.role} style={{ textAlign: 'center', padding: '3px 0' }}>
                              <button type="button"
                                className={`perm-cell ${canEditIt ? 'edit' : canSeeIt ? 'view' : 'none'} ${locked ? 'locked' : ''}`}
                                disabled={locked || savingRole === row.role}
                                aria-label={`${row.role} · ${t(`nav.${mod}`, mod)}: ${label}`}
                                title={locked
                                  ? (lang ? 'الأدمن يملك كل الصلاحيات دائماً' : 'Admin always keeps every module')
                                  : `${label} — ${lang ? 'اضغط للتغيير' : 'click to change'}`}
                                onClick={() => cyclePermission(row.role, mod)}>
                                {canEditIt ? <Edit2 size={14} /> : canSeeIt ? <Eye size={14} /> : <X size={14} />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="perm-footer">
                <span className="perm-key"><Edit2 size={12} color="var(--green)" /> {lang ? 'تعديل وعرض' : 'Edit & view'}</span>
                <span className="perm-key"><Eye size={12} color="var(--accent)" /> {lang ? 'عرض فقط' : 'View only'}</span>
                <span className="perm-key"><X size={12} opacity={0.5} /> {lang ? 'بدون' : 'None'}</span>
                <div className="grow" />
                {matrix.roles.filter((row) => row.role !== matrix.locked).map((row) => (
                  <button key={row.role} className="btn ghost sm" disabled={savingRole === row.role}
                    title={lang ? `إرجاع ${row.role} للافتراضي` : `Reset ${row.role} to defaults`}
                    onClick={() => resetRole(row.role)}>
                    <RotateCcw size={12} /> {row.role}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {adding && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setAdding(false)}>
          <form className="modal user-modal" onSubmit={addUser}>
            <div className="mh">
              <h3><UserPlus size={18} style={{ verticalAlign: -3, marginInlineEnd: 8 }} />
                {lang ? 'إضافة مستخدم' : 'Add user'}</h3>
              <span className="x" onClick={() => setAdding(false)}>&times;</span>
            </div>

            <div className="mb">
              <div className="fg">
                <label htmlFor="nu-user">{lang ? 'اسم المستخدم' : 'Username'}</label>
                <input id="nu-user" type="text" required autoFocus autoComplete="off"
                  value={form.u} placeholder={lang ? 'مثال: hossam' : 'e.g. hossam'}
                  onChange={e => setForm(f => ({ ...f, u: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))} />
                <div className="hint">
                  {lang ? 'يُستخدم لتسجيل الدخول. أحرف صغيرة وأرقام، 3 على الأقل.'
                        : 'Used to sign in. Lowercase letters and digits, 3 minimum.'}
                </div>
              </div>

              <div className="fg">
                <label htmlFor="nu-name">{lang ? 'الاسم الكامل' : 'Full name'}</label>
                <input id="nu-name" type="text" required value={form.name}
                  placeholder={lang ? 'مثال: حسام علي' : 'e.g. Hossam Ali'}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div className="user-grid">
                <div className="fg">
                  <label htmlFor="nu-role">{lang ? 'الدور' : 'Role'}</label>
                  <select id="nu-role" value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLE_LIST.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label htmlFor="nu-pass">{lang ? 'كلمة المرور' : 'Password'}</label>
                  <div className="user-pass">
                    <input id="nu-pass" type={showPassword ? 'text' : 'password'} required minLength={8}
                      value={form.password} autoComplete="new-password" placeholder="••••••••"
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? (lang ? 'إخفاء' : 'Hide password') : (lang ? 'إظهار' : 'Show password')}>
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <div className="hint" style={{ color: form.password && form.password.length < 8 ? 'var(--red)' : undefined }}>
                    {form.password.length < 8
                      ? (lang ? `${8 - form.password.length} حرف متبقٍ` : `${8 - form.password.length} more character${8 - form.password.length === 1 ? '' : 's'}`)
                      : (lang ? 'طول مناسب.' : 'Long enough.')}
                  </div>
                </div>
              </div>

              <div className="user-role-note">
                <Lock size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent)' }} />
                <span>
                  <b>{form.role}</b>{' '}
                  {lang
                    ? `— يرى ${(ROLES[form.role]?.view ?? []).length} قسماً، ويعدّل ${(ROLES[form.role]?.edit ?? []).length}.`
                    : `can view ${(ROLES[form.role]?.view ?? []).length} modules and edit ${(ROLES[form.role]?.edit ?? []).length}.`}
                  <br />
                  <span style={{ color: 'var(--muted)' }}>
                    {(ROLES[form.role]?.edit ?? []).length
                      ? `${lang ? 'تعديل:' : 'Can edit:'} ${(ROLES[form.role].edit).map(m => t(`nav.${m}`, m)).join(', ')}`
                      : (lang ? 'للقراءة فقط.' : 'Read-only access.')}
                  </span>
                </span>
              </div>

              {formError ? (
                <div className="user-error">
                  <CircleAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {formError}
                </div>
              ) : null}
            </div>

            <div className="mf">
              <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
                {lang ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? <LoaderCircle size={14} /> : <UserPlus size={14} />}{' '}
                {saving ? (lang ? 'جاري الإنشاء…' : 'Creating…') : (lang ? 'إنشاء المستخدم' : 'Create user')}
              </button>
            </div>
          </form>
        </div>
      )}

      </>}
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ROLES } from '../store';
import { apiFetch } from '../api';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('stmc_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [error, setError] = useState('');
  // Permissions are stored server-side so the matrix is editable. ROLES from
  // the bundle is only the fallback for the moment before they arrive, and
  // for when the API cannot be reached -- it is the same shipped default.
  const [roles, setRoles] = useState(ROLES);

  const loadRoles = useCallback(async () => {
    try {
      const res = await apiFetch('/roles');
      if (!res.ok) return;
      const data = await res.json();
      const map = Object.fromEntries((data.roles ?? []).map((row) => [row.role, { view: row.view ?? [], edit: row.edit ?? [] }]));
      if (Object.keys(map).length) setRoles(map);
    } catch { /* keep the shipped defaults */ }
  }, []);

  useEffect(() => { if (session) loadRoles(); }, [session, loadRoles]);

  useEffect(() => {
    const refresh = () => loadRoles();
    window.addEventListener('stmc:roles-changed', refresh);
    return () => window.removeEventListener('stmc:roles-changed', refresh);
  }, [loadRoles]);

  useEffect(() => {
    const clearExpiredSession = () => setSession(null);
    window.addEventListener('stmc:unauthorized', clearExpiredSession);
    return () => window.removeEventListener('stmc:unauthorized', clearExpiredSession);
  }, []);

  const login = async (username, password) => {
    try {
      const res = await apiFetch('/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      if (res.status === 401) throw new Error('INVALID_CREDENTIALS');
      if (!res.ok) throw new Error('LOGIN_UNAVAILABLE');
      const data = await res.json();
      const userSession = { user: data.user, role: data.role, token: data.accessToken, expiresAt: data.expiresAt };
      setError(''); setSession(userSession);
      localStorage.setItem('stmc_session', JSON.stringify(userSession));
      return true;
    } catch (err) {
      setError(err.message === 'INVALID_CREDENTIALS' ? 'Invalid username or password.' : 'Login service is unavailable. Start the backend and database first.');
      return false;
    }
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem('stmc_session');
  };

  const can    = (mod) => Boolean(session && roles[session.role]?.view.includes(mod));
  const canEdit = (mod) => Boolean(session && roles[session.role]?.edit.includes(mod));

  return (
    <AuthContext.Provider value={{ session, login, logout, error, setError, can, canEdit, roles }}>
      {children}
    </AuthContext.Provider>
  );
}

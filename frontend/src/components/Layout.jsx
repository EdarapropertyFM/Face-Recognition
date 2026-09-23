import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect } from 'react';
import {
  LayoutDashboard, Tv2, Camera, Building2, ClipboardList,
  Bell, Crosshair, Users, FileText, BarChart3,
  ShieldCheck, Settings, Moon, Sun, LogOut, ScanFace
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import { useState } from 'react';
import { useRealtime } from '../hooks/useRealtime';

const NAV_GROUPS = [
  {
    keyGroup: 'nav_monitor',
    items: [
      { key: 'dashboard',   path: '/',            icon: <LayoutDashboard size={18} /> },
      { key: 'livewall',    path: '/livewall',     icon: <Tv2 size={18} /> },
      { key: 'cameras',     path: '/cameras',      icon: <Camera size={18} /> },
      { key: 'buildings',   path: '/buildings',    icon: <Building2 size={18} /> },
      { key: 'alerts',      path: '/alerts',       icon: <Bell size={18} /> },
      { key: 'track',       path: '/track',        icon: <Crosshair size={18} /> },
    ],
  },
  {
    keyGroup: 'nav_identity',
    items: [
      { key: 'enrollments', path: '/enrollments',  icon: <ClipboardList size={18} /> },
      { key: 'facedb',      path: '/facedb',       icon: <Users size={18} /> },
      { key: 'incidents',   path: '/incidents',    icon: <FileText size={18} /> },
      { key: 'reports',     path: '/reports',      icon: <BarChart3 size={18} /> },
    ],
  },
  {
    keyGroup: 'nav_system',
    items: [
      { key: 'admin',    path: '/admin',    icon: <ShieldCheck size={18} /> },
      { key: 'facetest', path: '/face-test', icon: <ScanFace size={18} /> },
      { key: 'settings', path: '/settings', icon: <Settings size={18} /> },
    ],
  },
];



export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { session, logout, can } = useAuth();
  const isRtl = i18n.language === 'ar';
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleLanguage = () => i18n.changeLanguage(isRtl ? 'en' : 'ar');
  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);
  };

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = isRtl ? 'ar' : 'en';
  }, [isRtl]);

  const [badges, setBadges] = useState({ alerts: null, enrollments: null, incidents: null, facedb: null });

  const loadBadges = useCallback(async () => {
    if (!session) return;
      try {
        const res = await apiFetch('/dashboard/badges');
        if (res.ok) {
          const data = await res.json();
          setBadges({
            alerts: data.alerts || null,
            enrollments: data.enrollments || null,
            incidents: data.incidents || null,
            facedb: data.facedb || null
          });
        }
      } catch { /* connection failures are retried by the realtime hook */ }
  }, [session]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- initial dashboard badge synchronization
    loadBadges();
  }, [loadBadges]);
  useRealtime(() => loadBadges(), Boolean(session));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const newAlerts = badges.alerts || 0;

  function getBadge(key) {
    return badges[key] || null;
  }

  return (
    <div>
      {/* ── Topbar ─────────────────────────────────────────── */}
      <div className="topbar">
        <div style={{
          width: 32, height: 32, background: 'var(--accent)', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 900, fontSize: 16, flexShrink: 0,
        }}>W</div>

        <div className="sys">
          <b>{t('sys_name')}</b>
          <span>{t('sys_desc')}</span>
        </div>

        <div className="grow" />

        <button className="tb-btn" onClick={toggleLanguage}>
          {isRtl ? 'English' : 'عربي'}
        </button>

        <button className="tb-btn" onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <Link to="/alerts" className="tb-btn" style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
          <Bell size={14} />
          {newAlerts > 0 && <span className="pill">{newAlerts}</span>}
        </Link>

        {session && (
          <div className="userchip">
            <div className="avatar">{session.user.slice(0, 2).toUpperCase()}</div>
            <span>{session.user} · {session.role}</span>
          </div>
        )}

        <button className="tb-btn" onClick={handleLogout} title={t('login.logout')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--red)' }}>
          <LogOut size={14} />
        </button>
      </div>

      <div className="wrap">
        {/* ── Sidebar ──────────────────────────────────────── */}
        <div className="nav">
          {NAV_GROUPS.map(group => {
            const visibleItems = group.items.filter(item => can(item.key));
            if (!visibleItems.length) return null;
            return (
              <div key={group.keyGroup}>
                <div className="sep">{t(group.keyGroup)}</div>
                {visibleItems.map(item => {
                  const badge = getBadge(item.key);
                  const isActive = item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path);
                  return (
                    <Link key={item.key} to={item.path} className={isActive ? 'active' : ''}>
                      <span className="ico">{item.icon}</span>
                      <span className="lbl">{t(`nav.${item.key}`)}</span>
                      {badge && <span className="navcount">{badge}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── Main Content ─────────────────────────────────── */}
        <div className="main">
          {children}
        </div>
      </div>
    </div>
  );
}

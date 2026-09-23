import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/useAuth';
import { Shield, Eye, EyeOff } from 'lucide-react';
import './LoginPage.css';

export default function LoginPage() {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const isRtl = i18n.language === 'ar';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (await login(username, password)) {
      navigate('/');
    }
  };

  return (
    <div className="login-page" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Background grid */}
      <div className="login-bg" />

      <div className="login-card">
        {/* Logo area */}
        <div className="login-logo">
          <div className="login-logo-icon">
            <Shield size={32} />
          </div>
          <div>
            <h1 className="login-brand">STMC</h1>
            <p className="login-tagline">{t('login.tagline')}</p>
          </div>
        </div>

        <div className="login-divider" />

        <form onSubmit={handleSubmit} className="login-form">
          <div className="fg">
            <label htmlFor="lg-user">{t('login.username')}</label>
            <input
              id="lg-user"
              type="text"
              placeholder={t('login.username_placeholder')}
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="fg">
            <label htmlFor="lg-pass">{t('login.password')}</label>
            <div className="pw-wrap">
              <input
                id="lg-pass"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="login-hint">{t('login.password_hint')}</div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn login-btn">
            {t('login.enter')}
          </button>
        </form>

        <div className="login-footer">
          <span>{t('login.powered_by')}</span>
          <button
            className="tb-btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
          >
            {i18n.language === 'ar' ? 'English' : 'عربي'}
          </button>
        </div>
      </div>
    </div>
  );
}

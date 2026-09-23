import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SETTINGS_DEFAULT } from '../store';
import { Settings, Brain, Bell, ShieldCheck, Check, Save } from 'lucide-react';

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [s, setS] = useState({ ...SETTINGS_DEFAULT });

  const update = (key, val) => setS(prev => ({ ...prev, [key]: val }));

  return (
    <>
      <div className="ph">
        <div>
          <h1><Settings size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.settings')}</h1>
          <div className="sub">{lang ? 'النظام · التعرف · الأمان' : 'system · recognition · security'}</div>
        </div>
      </div>

      <div className="two">
        {/* Recognition */}
        <div className="panel glass-panel">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Brain size={18} color="var(--accent)" /> {lang ? 'التعرف' : 'Recognition'}</h3>

          <div className="fg" style={{ background: 'var(--stat-bg)', padding: '16px', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
            <label>{lang ? 'حد ثقة المطابقة —' : 'Match confidence threshold —'} <b style={{ color: 'var(--accent)' }}>{s.threshold}%</b></label>
            <div className="rangewrap" style={{ marginTop: 8 }}>
              <input
                type="range" min={60} max={99} value={s.threshold}
                onChange={e => update('threshold', +e.target.value)}
              />
            </div>
            <div className="hint" style={{ marginTop: 8 }}>{lang ? 'أقل من هذا، لا يتم التحقق من التطابق.' : 'Below this, no match is asserted.'}</div>
          </div>

          <div className="fg">
            <label>{lang ? 'الاحتفاظ بالوجوه القياسية (أيام)' : 'Standard face retention (days)'}</label>
            <input type="number" value={s.retStd} onChange={e => update('retStd', +e.target.value)} min={30} max={365} style={{ background: 'var(--stat-bg)' }} />
            <div className="hint">{lang ? 'الغرباء غير المرتبطين بحوادث يُحذفون تلقائياً.' : 'Strangers not linked to incidents auto-purged.'}</div>
          </div>

          <div className="fg">
            <label>{lang ? 'احتفاظ وجوه الحوادث (أيام)' : 'Incident-linked face retention (days)'}</label>
            <input type="number" value={s.retInc} onChange={e => update('retInc', +e.target.value)} min={365} max={3650} style={{ background: 'var(--stat-bg)' }} />
          </div>

          <div className="fg">
            <label>{lang ? 'احتفاظ سجلات التدقيق (أيام)' : 'Audit log retention (days)'}</label>
            <input type="number" value={s.retLog} onChange={e => update('retLog', +e.target.value)} min={365} max={3650} style={{ background: 'var(--stat-bg)' }} />
          </div>
        </div>

        {/* Alerts & System */}
        <div className="panel glass-panel">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bell size={18} color="var(--accent)" /> {lang ? 'إعدادات التنبيهات' : 'Alert configuration'}</h3>

          <div style={{ background: 'var(--stat-bg)', padding: '16px', borderRadius: 12, border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              ['alertWatch',    lang ? 'تنبيه عند رصد قائمة المنع' : 'Alert on watchlist detection'],
              ['alertStrangers', lang ? 'تنبيه عند رصد الغرباء' : 'Alert on stranger detection'],
              ['alertOwners',   lang ? 'تنبيه عند رصد الملاك' : 'Alert on owner detection'],
              ['autoEnrollStrangers', lang ? 'تسجيل الغرباء تلقائياً (track ID)' : 'Auto-create stranger track IDs'],
            ].map(([key, label]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--txt)' }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', width: 30, textAlign: 'right' }}>{s[key] ? (lang ? 'مفعّل' : 'On') : (lang ? 'معطّل' : 'Off')}</span>
                  <div className={`sw ${s[key] ? 'on' : ''}`} onClick={() => update(key, !s[key])} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={18} color="var(--green)" /> {lang ? 'ملاحظات خصوصية' : 'Privacy notes'}</h3>
            <div className="panel glass-panel" style={{ padding: '12px 16px', background: 'rgba(46,204,113,0.05)', border: '1px solid rgba(46,204,113,0.2)' }}>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--txt)' }}>
                {lang
                  ? 'البيانات الحيوية مشفّرة أثناء النقل وفي مرحلة التخزين. وجوه الغرباء تُحذف خلال 90 يوماً ما لم ترتبط بحادثة. التسجيل مشروط بموافقة المالك الصريحة.'
                  : 'Biometric data encrypted in transit and at rest. Stranger faces purged after 90 days unless incident-linked. Enrollment requires explicit owner consent.'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 13 }} onClick={() => alert(lang ? 'تم الحفظ!' : 'Settings saved!')}>
              <Save size={16} /> {lang ? 'حفظ الإعدادات' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

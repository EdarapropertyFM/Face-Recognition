import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell, Brain, Check, LoaderCircle, Save, Settings, ShieldCheck, Trash2, TriangleAlert,
} from 'lucide-react';
import { apiFetch } from '../api';

/** Only these reach the API; anything else would be silently discarded. */
const FIELDS = ['threshold', 'retStd', 'retLog', 'alertOwners', 'alertStrangers', 'purgeEnabled'];

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;

  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(null);      // last state known to be stored
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/settings');
      if (!response.ok) throw new Error('Could not load settings.');
      const data = await response.json();
      setSettings(data);
      setSaved(data);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not load settings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setNote('');
  };

  // Comparing against what was stored is what makes the Save button honest:
  // it is enabled when there is something to save, and not otherwise.
  const dirty = Boolean(settings && saved
    && FIELDS.some((key) => settings[key] !== saved[key]));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(FIELDS.map((key) => [key, settings[key]]));
      const response = await apiFetch('/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(Array.isArray(data.message) ? data.message.join(', ')
          : data.message || 'The server rejected these settings.');
      }
      setSettings(data);
      setSaved(data);
      setNote(lang ? 'تم الحفظ وتطبيقه على النظام.' : 'Saved and applied to the running system.');
    } catch (saveError) {
      setError(saveError.message);
    } finally { setBusy(false); }
  };

  const purgeNow = async () => {
    if (!window.confirm(lang
      ? 'حذف الرصدات والصور الأقدم من مدة الاحتفاظ؟ لا يمكن التراجع.'
      : 'Delete sightings and images older than the retention period? This cannot be undone.')) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/settings/purge', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Purge failed.');
      setNote(lang
        ? `تم حذف ${data.detections} رصدة و${data.alerts} تنبيه.`
        : `Removed ${data.detections} sighting(s) and ${data.alerts} alert(s).`);
    } catch (purgeError) {
      setError(purgeError.message);
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="panel glass-panel"><div className="sub">
      <LoaderCircle size={15} /> {lang ? 'جاري التحميل…' : 'Loading settings…'}
    </div></div>;
  }
  if (!settings) {
    return <div className="panel glass-panel"><div className="err">{error}</div></div>;
  }

  const toggles = [
    ['alertStrangers', lang ? 'تنبيه عند رصد شخص غير مسجّل' : 'Alert when an unrecognised person is seen',
      lang ? 'المصدر الرئيسي للتنبيهات.' : 'The main source of alerts.'],
    ['alertOwners', lang ? 'تنبيه عند رصد ساكن مسجّل' : 'Alert when a registered resident is seen',
      lang ? 'يولّد تنبيهات كثيرة؛ يُترك معطّلاً عادة.' : 'Noisy: a resident in their own lobby is rarely an event.'],
    ['purgeEnabled', lang ? 'تطبيق مدة الاحتفاظ تلقائياً' : 'Apply retention automatically',
      lang ? 'إذا عُطّل، لا يُحذف أي شيء.' : 'If off, nothing is ever deleted.'],
  ];

  return (
    <>
      <div className="ph">
        <div>
          <h1><Settings size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginInlineEnd: 8, marginBottom: 4 }} />{t('nav.settings')}</h1>
          <div className="sub">{lang ? 'التعرف · الاحتفاظ · التنبيهات' : 'recognition · retention · alerts'}</div>
        </div>
        <div className="grow" />
        <button className="btn" disabled={!dirty || busy} onClick={save}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {busy ? <LoaderCircle size={15} /> : <Save size={15} />}
          {lang ? 'حفظ' : 'Save changes'}
        </button>
      </div>

      {error ? <div className="note" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{error}</div> : null}
      {note ? <div className="note" style={{ color: 'var(--green)', borderColor: 'var(--green)' }}>
        <Check size={14} style={{ verticalAlign: -2 }} /> {note}
      </div> : null}

      <div className="two">
        <div className="panel glass-panel">
          <h3><Brain size={18} color="var(--accent)" /> {lang ? 'التعرف' : 'Recognition'}</h3>

          <div className="set-block">
            <label>
              {lang ? 'حد التطابق' : 'Match threshold'}
              <b style={{ color: 'var(--accent)' }}> {settings.threshold}%</b>
            </label>
            <input type="range" min={25} max={70} value={settings.threshold}
              onChange={(event) => update('threshold', Number(event.target.value))} />
            <div className="set-scale"><span>25% {lang ? 'متساهل' : 'permissive'}</span><span>70% {lang ? 'صارم' : 'strict'}</span></div>
            <div className="hint">
              {lang
                ? 'مدى تشابه الوجه المطلوب لاعتباره مطابقاً. الأقل يتعرّف على عدد أكبر لكنه قد يسمّي الشخص الخطأ؛ الأعلى أكثر أماناً لكنه يسجّل السكان كغرباء.'
                : 'How similar a face must be to count as a match. Lower recognises more people but starts naming the wrong ones; higher is safer but records residents as strangers.'}
            </div>
            {settings.threshold <= 30 ? (
              <div className="set-warn"><TriangleAlert size={13} /> {lang
                ? 'قيمة منخفضة جداً: احتمال مطابقة خاطئة.'
                : 'Very low: expect false matches naming the wrong person.'}</div>
            ) : null}
          </div>

          <div className="hint" style={{ marginTop: 10 }}>
            {lang
              ? 'يُطبَّق فوراً على خدمة التعرّف دون إعادة تشغيل.'
              : 'Applied to the recognition service immediately, without a restart.'}
          </div>
        </div>

        <div className="panel glass-panel">
          <h3><Bell size={18} color="var(--accent)" /> {lang ? 'التنبيهات' : 'Alerts'}</h3>
          <div className="set-block set-toggles">
            {toggles.map(([key, label, hint]) => (
              <div className="set-toggle" key={key}>
                <div>
                  <span>{label}</span>
                  <small>{hint}</small>
                </div>
                <div className="set-switch">
                  <span>{settings[key] ? (lang ? 'مفعّل' : 'On') : (lang ? 'معطّل' : 'Off')}</span>
                  <div className={`sw ${settings[key] ? 'on' : ''}`} role="switch"
                    tabIndex={0} aria-checked={Boolean(settings[key])} aria-label={label}
                    onClick={() => update(key, !settings[key])}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        update(key, !settings[key]);
                      }
                    }} />
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 22 }}><ShieldCheck size={18} color="var(--green)" /> {lang ? 'الاحتفاظ بالبيانات' : 'Data retention'}</h3>
          <div className="set-block">
            <div className="enrollment-grid">
              <div className="fg">
                <label>{lang ? 'الرصدات والصور (أيام)' : 'Sightings and images (days)'}</label>
                <input type="number" min={1} max={3650} value={settings.retStd}
                  onChange={(event) => update('retStd', Number(event.target.value))} />
              </div>
              <div className="fg">
                <label>{lang ? 'التنبيهات وسجل التدقيق (أيام)' : 'Alerts and audit trail (days)'}</label>
                <input type="number" min={1} max={3650} value={settings.retLog}
                  onChange={(event) => update('retLog', Number(event.target.value))} />
              </div>
            </div>
            <div className="hint">
              {lang
                ? 'وجوه الغرباء وصورها تُحذف نهائياً بعد هذه المدة. الحذف يعمل كل ساعة.'
                : 'Stranger faces and their saved images are deleted permanently after this. The purge runs hourly.'}
            </div>
            <button className="btn ghost sm" disabled={busy} onClick={purgeNow}
              style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={13} /> {lang ? 'تشغيل الحذف الآن' : 'Run purge now'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

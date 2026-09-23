import { useTranslation } from 'react-i18next';
import { Download, BarChart3, Map, PieChart, Info, TrendingUp, AlertTriangle, Users, FileText, Activity, ShieldAlert } from 'lucide-react';
import { DETECTIONS, ZONES, INCIDENTS, PENDING_ENROLLMENTS, SEF_FORMS } from '../store';

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;

  // 1. Detections by location
  const byZone = ZONES.map((z, i) => ({
    name: z[lang],
    count: DETECTIONS.filter(d => d.zone === i).length,
  })).sort((a, b) => b.count - a.count); // Sort by highest
  const maxZone = Math.max(...byZone.map(x => x.count), 1);

  // 2. Detections by type
  const byType = [
    { type: 'known',   label: lang ? 'مُلاّك ومقيمون' : 'Owners & Residents', color: 'var(--green)' },
    { type: 'staff',   label: lang ? 'موظفو الأمن والخدمات' : 'Staff & Security', color: 'var(--accent)' },
    { type: 'unknown', label: lang ? 'غرباء' : 'Strangers', color: 'var(--amber)' },
    { type: 'watch',   label: lang ? 'قائمة المنع / محظورون' : 'Watchlist / Banned', color: 'var(--red)' },
  ].map(x => ({ ...x, count: DETECTIONS.filter(d => d.type === x.type).length }));
  const maxType = Math.max(...byType.map(x => x.count), 1);

  // 3. Hourly Detection Trend (Mock)
  // We'll group detections by 4-hour blocks for a cleaner UI
  const timeBlocks = [
    { label: '00:00 - 04:00', filter: h => h >= 0 && h < 4 },
    { label: '04:00 - 08:00', filter: h => h >= 4 && h < 8 },
    { label: '08:00 - 12:00', filter: h => h >= 8 && h < 12 },
    { label: '12:00 - 16:00', filter: h => h >= 12 && h < 16 },
    { label: '16:00 - 20:00', filter: h => h >= 16 && h < 20 },
    { label: '20:00 - 24:00', filter: h => h >= 20 && h < 24 },
  ];
  const byTime = timeBlocks.map(tb => {
    const count = DETECTIONS.filter(d => tb.filter(new Date(d.ts).getHours())).length;
    return { label: tb.label, count };
  });
  const maxTime = Math.max(...byTime.map(x => x.count), 1);

  // 4. Incidents by SEF Form
  const bySef = Object.keys(SEF_FORMS).map(k => ({
    sef: k,
    name: SEF_FORMS[k][lang],
    count: INCIDENTS.filter(i => i.sef === k).length
  })).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  const maxSef = Math.max(...bySef.map(x => x.count), 1);

  // KPIs
  const totalDetections = DETECTIONS.length;
  const watchHits = DETECTIONS.filter(d => d.type === 'watch').length;
  const activeIncidents = INCIDENTS.filter(i => i.status !== 'closed').length;
  const pendingEnroll = PENDING_ENROLLMENTS.length;

  return (
    <>
      <div className="ph">
        <div>
          <h1><BarChart3 size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.reports')}</h1>
          <div className="sub">{lang ? 'لوحة المعلومات التحليلية للأمن الشامل' : 'Comprehensive Security Analytics Dashboard'}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 20 }}>
        <div className="grow" />
        <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={14} /> {lang ? 'توليد تقرير مفصل' : 'Generate Full Report'}</button>
        <button className="btn ghost" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export CSV</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="panel glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: 10, background: 'rgba(0,164,196,0.15)', borderRadius: 10, color: 'var(--accent)' }}><Activity size={20} /></div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{lang ? 'إجمالي الاكتشافات' : 'Total Detections'}</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{totalDetections}</div>
          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 8 }}>+12% vs last week</div>
        </div>
        <div className="panel glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: 10, background: 'rgba(231,76,60,0.15)', borderRadius: 10, color: 'var(--red)' }}><ShieldAlert size={20} /></div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{lang ? 'تطابقات قائمة المنع' : 'Watchlist Hits'}</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{watchHits}</div>
          <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>Immediate action required</div>
        </div>
        <div className="panel glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: 10, background: 'rgba(243,156,18,0.15)', borderRadius: 10, color: 'var(--amber)' }}><AlertTriangle size={20} /></div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{lang ? 'حوادث نشطة' : 'Active Incidents'}</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{activeIncidents}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>{INCIDENTS.length} total incidents</div>
        </div>
        <div className="panel glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: 10, background: 'rgba(46,204,113,0.15)', borderRadius: 10, color: 'var(--green)' }}><Users size={20} /></div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{lang ? 'طلبات تسجيل معلقة' : 'Pending Enrollments'}</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{pendingEnroll}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Awaiting validation</div>
        </div>
      </div>

      <div className="two">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Trend Analysis */}
          <div className="panel glass-panel">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={18} color="var(--accent)" /> {lang ? 'كثافة الاكتشافات على مدار اليوم' : 'Detection Density (24h)'}</h3>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
              {byTime.map((tb, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '100%', maxWidth: 40, height: `${(tb.count / maxTime) * 100}%`, background: 'rgba(0,164,196,0.3)', borderRadius: '6px 6px 0 0', border: '1px solid rgba(0,164,196,0.5)', borderBottom: 'none', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>{tb.count}</div>
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{tb.label.split(' - ')[0]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Incidents by SEF */}
          <div className="panel glass-panel">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={18} color="var(--amber)" /> {lang ? 'تحليل الحوادث حسب نماذج SEF' : 'Incident Analysis by SEF Forms'}</h3>
            <div style={{ marginTop: 16 }}>
              {bySef.map((s, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="sefbadge" style={{ padding: '2px 6px', fontSize: 9 }}>{s.sef}</span> {s.name}</span>
                    <b style={{ color: '#fff' }}>{s.count}</b>
                  </div>
                  <div style={{ height: 8, background: 'var(--stat-bg)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                    <div style={{ height: '100%', width: `${(s.count / maxSef) * 100}%`, background: 'var(--amber)', boxShadow: '0 0 10px var(--amber)', transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* By location */}
          <div className="panel glass-panel">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Map size={18} color="var(--purple)" /> {lang ? 'الاكتشافات حسب المنطقة' : 'Detections by Zone'}</h3>
            <div style={{ marginTop: 16 }}>
              {byZone.map((z, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--txt)' }}>{z.name}</span>
                    <b style={{ color: '#fff' }}>{z.count}</b>
                  </div>
                  <div style={{ height: 8, background: 'var(--stat-bg)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                    <div style={{ height: '100%', width: `${(z.count / maxZone) * 100}%`, background: 'var(--purple)', boxShadow: '0 0 10px var(--purple)', transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By type */}
          <div className="panel glass-panel">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PieChart size={18} color="var(--accent)" /> {lang ? 'التوزيع الديموغرافي' : 'Demographic Distribution'}</h3>
            <div style={{ marginTop: 16 }}>
              {byType.map((x, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--txt)' }}>{x.label}</span>
                    <b style={{ color: '#fff' }}>{x.count}</b>
                  </div>
                  <div style={{ height: 8, background: 'var(--stat-bg)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                    <div style={{ height: '100%', width: `${(x.count / maxType) * 100}%`, background: x.color, boxShadow: `0 0 10px ${x.color}`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="panel glass-panel" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginTop: 24, background: 'rgba(0,164,196,0.08)', border: '1px solid rgba(0,164,196,0.2)' }}>
              <Info size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--txt)' }}>
                {lang 
                  ? 'يتم تحديث هذه التحليلات فورياً بناءً على بيانات الذكاء الاصطناعي (AI) الخاصة بكاميرات المراقبة، ونماذج التعدي (SEF)، وقاعدة الوجوه الحية.'
                  : 'These analytics update in real-time based on live AI camera telemetry, Security Event Forms (SEF), and the active Face Database.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

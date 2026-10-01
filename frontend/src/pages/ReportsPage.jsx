import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Building2, Cctv, Clock, LoaderCircle, Search, ShieldAlert, Upload, UserCheck, UserX, Users, X } from 'lucide-react';
import { apiFetch } from '../api';
import { Columns, Bars, Donut, Stat, SERIES } from '../components/Charts';

const RANGES = [
  [1, 'اليوم', 'Today'],
  [7, 'آخر ٧ أيام', 'Last 7 days'],
  [30, 'آخر ٣٠ يوم', 'Last 30 days'],
  [90, 'آخر ٩٠ يوم', 'Last 90 days'],
];
const todayIso = () => new Date().toISOString().slice(0, 10);

/** One flat CSV of everything on the page, so the numbers can be audited. */
function exportCsv(data, lang) {
  const rows = [['Section', 'Key', 'Value']];
  const { totals } = data;
  rows.push(['Range', 'Days', data.range.days], ['Range', 'From', data.range.from.slice(0, 10)],
    ['Range', 'To', data.range.to.slice(0, 10)]);
  rows.push(['Totals', 'Detections', totals.sightings], ['Totals', 'People seen', totals.people],
    ['Totals', 'Residents', totals.residents], ['Totals', 'Strangers', totals.strangers],
    ['Totals', 'Recognition rate %', totals.recognitionRate ?? ''],
    ['Totals', 'Cameras online', `${totals.cameras.online}/${totals.cameras.total}`],
    ['Totals', 'Alerts', totals.alerts.total], ['Totals', 'Alerts per day', totals.alerts.perDay],
    ['Totals', 'Enrolled faces', totals.faces.total],
    ['Totals', 'Enrollments pending', totals.enrollments.pending]);
  data.daily.forEach((day) => rows.push(['Daily', day.date,
    `detections=${day.sightings};residents=${day.residents};strangers=${day.strangers};alerts=${day.alerts}`]));
  data.hourly.forEach((hour) => rows.push(['Detections by hour', `${String(hour.hour).padStart(2, '0')}:00`, hour.sightings]));
  data.byCamera.forEach((cam) => rows.push(['Camera', cam.name,
    `detections=${cam.sightings};strangers=${cam.strangers};building=${cam.building ?? ''}`]));
  totals.alerts.byCamera.forEach((cam) => rows.push(['Alerts by camera', cam.name, cam.count]));
  totals.alerts.byHour.forEach((h) => rows.push(['Alerts by hour', `${String(h.hour).padStart(2, '0')}:00`, h.count]));
  data.byBuilding.forEach((b) => rows.push(['Building', b.building, `detections=${b.sightings};strangers=${b.strangers}`]));

  const csv = rows.map(cells => cells.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `stmc-report-${data.range.days}d-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  void lang;
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [days, setDays] = useState(30);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [project, setProject] = useState('');
  const [building, setBuilding] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setData(null); setError('');
    const scope = new URLSearchParams({ days: String(days) });
    // An explicit window wins over the preset; the server reads it the same way.
    if (from || to) { if (from) scope.set('from', from); if (to) scope.set('to', to); }
    if (project) scope.set('project', project);
    if (building) scope.set('building', building);
    apiFetch(`/reports/analytics?${scope}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then(result => { if (live) setData(result); })
      .catch(err => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [days, from, to, project, building]);

  const totals = data?.totals;
  const hit = (...fields) => !search
    || fields.some(f => String(f ?? '').toLowerCase().includes(search.toLowerCase()));
  const camerasShown = (data?.byCamera ?? []).filter(c => hit(c.name, c.building, c.project));
  const buildingsShown = (data?.byBuilding ?? []).filter(b => hit(b.building));

  const peopleSlices = useMemo(() => totals ? [
    { label: lang ? 'مقيمون معروفون' : 'Known residents', value: totals.residents, color: SERIES[0] },
    { label: lang ? 'غرباء' : 'Strangers', value: totals.strangers, color: SERIES[1] },
  ] : [], [totals, lang]);

  return (
    <>
      <div className="ph">
        <div>
          <h1><BarChart3 size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginInlineEnd: 8, marginBottom: 4 }} />{t('nav.reports')}</h1>
          <div className="sub">
            {data
              ? `${data.range.from.slice(0, 10)} → ${data.range.to.slice(0, 10)}`
              : (lang ? 'تحليلات النظام' : 'System analytics')}
          </div>
        </div>
      </div>

      {/* Filters sit open above the report: they decide what every number
          below means, so hiding them behind a toggle hides the context. */}
      <div className="rep-filters">
        <div className="chips">
          {RANGES.map(([value, ar, en]) => (
            <span key={value} className={`chip ${!from && !to && days === value ? 'on' : ''}`}
              onClick={() => { setDays(value); setFrom(''); setTo(''); }}>
              {lang ? ar : en}
            </span>
          ))}
        </div>

        {/* Any window, not just the presets. Choosing a date takes over from
            the chips; clearing both hands control back to them. */}
        <div className="rep-dates">
          <input type="date" value={from} max={to || todayIso()}
            aria-label={lang ? 'من تاريخ' : 'From date'}
            onChange={e => setFrom(e.target.value)} />
          <span className="rep-dates-sep">→</span>
          <input type="date" value={to} min={from || undefined} max={todayIso()}
            aria-label={lang ? 'إلى تاريخ' : 'To date'}
            onChange={e => setTo(e.target.value)} />
        </div>

        <div className="search">
          <Search size={14} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={lang ? 'بحث بالكاميرا أو المبنى…' : 'Search camera or building…'} />
        </div>

        <select value={project} onChange={e => { setProject(e.target.value); setBuilding(''); }}>
          <option value="">{lang ? 'كل المشاريع' : 'All projects'}</option>
          {(data?.filters?.projects ?? []).map(name => <option key={name} value={name}>{name}</option>)}
        </select>

        <select value={building} onChange={e => setBuilding(e.target.value)}>
          <option value="">{lang ? 'كل المباني' : 'All buildings'}</option>
          {(data?.filters?.buildings ?? []).map(code => <option key={code} value={code}>{code}</option>)}
        </select>

        {(project || building || search || from || to) && (
          <button className="btn ghost sm"
            onClick={() => { setProject(''); setBuilding(''); setSearch(''); setFrom(''); setTo(''); }}>
            <X size={13} /> {lang ? 'مسح' : 'Clear'}
          </button>
        )}

        <div className="grow" />
        <button className="btn ghost sm" disabled={!data} onClick={() => exportCsv(data, lang)}>
          <Upload size={14} /> {lang ? 'تصدير CSV' : 'Export CSV'}
        </button>
      </div>

      {error ? (
        <div className="panel glass-panel" style={{ padding: 16, color: 'var(--red)' }}>
          {lang ? 'تعذر تحميل التقرير: ' : 'Could not load the report: '}{error}
        </div>
      ) : !data ? (
        <div className="panel glass-panel" style={{ padding: 24 }}>
          <div className="sub"><LoaderCircle size={15} /> {lang ? 'جاري الحساب…' : 'Calculating…'}</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 14, marginBottom: 18 }}>
            {/* Distinct people, not raw detections. A detection count rises
                with how long somebody lingers, so it cannot be compared
                between cameras or days; this can. */}
            <Stat icon={<Users size={18} />} label={lang ? 'أشخاص شوهدوا' : 'People seen'}
              value={totals.people.toLocaleString()}
              hint={lang
                ? `${Math.round(totals.people / data.range.days)} شخص يومياً في المتوسط`
                : `${Math.round(totals.people / data.range.days).toLocaleString()}/day on average`} />
            <Stat icon={<UserCheck size={18} />} label={lang ? 'تم التعرف عليهم' : 'Of those, identified'}
              value={totals.residents.toLocaleString()} tone="var(--green)"
              hint={totals.recognitionRate === null
                ? (lang ? 'لا بيانات' : 'no data yet')
                : `${totals.recognitionRate}% ${lang ? 'نسبة التعرّف' : 'recognition rate'}`} />
            <Stat icon={<UserX size={18} />} label={lang ? 'غرباء' : 'Of those, strangers'}
              value={totals.strangers.toLocaleString()} tone="var(--amber)"
              hint={lang ? 'أشخاص مختلفون غير مسجلين' : 'distinct people not enrolled'} />
            <Stat icon={<ShieldAlert size={18} />} label={lang ? 'التنبيهات' : 'Alerts raised'}
              value={totals.alerts.total.toLocaleString()} tone="var(--red)"
              hint={lang ? `${totals.alerts.perDay} يومياً` : `${totals.alerts.perDay}/day on average`} />
            <Stat icon={<Cctv size={18} />} label={lang ? 'الكاميرات' : 'Cameras'}
              value={`${totals.cameras.online}/${totals.cameras.total}`}
              hint={totals.cameras.offline
                ? `${totals.cameras.offline} ${lang ? 'غير متصل' : 'offline'}`
                : (lang ? 'كلها متصلة' : 'all online')}
              tone={totals.cameras.offline ? 'var(--red)' : 'var(--green)'} />
          </div>

          <div className="panel glass-panel" style={{ marginBottom: 18 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="var(--accent)" /> {lang ? 'النشاط حسب ساعة اليوم' : 'Activity by hour of day'}
            </h3>
            <div className="hint" style={{ marginBottom: 4 }}>
              {totals.busiestHour?.sightings
                ? (lang
                  ? `أكثر الساعات ازدحاماً ${String(totals.busiestHour.hour).padStart(2, '0')}:00`
                  : `Busiest hour is ${String(totals.busiestHour.hour).padStart(2, '0')}:00 — useful for shift planning.`)
                : (lang ? 'لا توجد رصدات بعد.' : 'No sightings recorded yet.')}
            </div>
            <Columns data={data.hourly} xKey="hour" yKey="sightings"
              formatX={(hour) => `${String(hour).padStart(2, '0')}`}
              formatTip={(row) => `${String(row.hour).padStart(2, '0')}:00 — ${row.sightings.toLocaleString()} ${lang ? 'رصدة' : 'detections'}`} />
          </div>

          <div className="two">
            <div className="panel glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cctv size={18} color="var(--accent)" /> {lang ? 'انشغال الكاميرات' : 'Busiest cameras'}
              </h3>
              <Bars data={camerasShown.slice(0, 8)} labelKey="name" valueKey="sightings" color={SERIES[0]}
                empty={lang ? 'لا توجد رصدات' : 'No sightings in this period'} />
            </div>

            <div className="panel glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={18} color="var(--accent)" /> {lang ? 'انشغال المباني' : 'Busiest buildings'}
              </h3>
              <Bars data={buildingsShown.slice(0, 8)} labelKey="building" valueKey="sightings" color={SERIES[2]}
                empty={lang ? 'لا توجد رصدات' : 'No sightings in this period'} />
            </div>

            <div className="panel glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} color="var(--accent)" /> {lang ? 'من شوهد' : 'Who was seen'}
              </h3>
              <div style={{ marginTop: 16 }}>
                <Donut slices={peopleSlices} centerValue={totals.people.toLocaleString()}
                  centerLabel={lang ? 'أشخاص' : 'people'} />
              </div>
            </div>

            <div className="panel glass-panel">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={18} color="var(--accent)" /> {lang ? 'مصدر التنبيهات' : 'Where alerts come from'}
              </h3>
              <Bars data={totals.alerts.byCamera.slice(0, 8)} labelKey="name" valueKey="count" color={SERIES[1]}
                empty={lang ? 'لا توجد تنبيهات في هذه الفترة.' : 'No alerts in this period.'} />
            </div>
          </div>

          {/* The table view: every number above, readable without colour. */}
          <div className="panel glass-panel" style={{ padding: 0, marginTop: 18, overflowX: 'auto', border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>{lang ? 'الكاميرا' : 'Camera'}</th>
                  <th>{lang ? 'المشروع' : 'Project'}</th>
                  <th>{lang ? 'المبنى' : 'Building'}</th>
                  <th>{lang ? 'الرصد' : 'Detections'}</th>
                  <th>{lang ? 'غرباء' : 'Strangers'}</th>
                </tr>
              </thead>
              <tbody>
                {camerasShown.length ? camerasShown.map(cam => (
                  <tr key={cam.id}>
                    <td>
                      <b>{cam.name}</b>
                      {cam.removed && (
                        <span className="tag watch" style={{ marginInlineStart: 6, fontSize: 10 }}
                          title={lang
                            ? 'كاميرا محذوفة — الرصدات محفوظة'
                            : 'This camera was removed; its past sightings are kept'}>
                          {lang ? 'محذوفة' : 'removed'}
                        </span>
                      )}
                    </td>
                    <td>{cam.project || '—'}</td>
                    <td className="mono">{cam.building || '—'}</td>
                    <td className="mono">{cam.sightings.toLocaleString()}</td>
                    <td className="mono">{cam.strangers.toLocaleString()}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="sub" style={{ padding: 16 }}>
                    {lang ? 'لا توجد رصدات في هذه الفترة.' : 'No sightings in this period.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

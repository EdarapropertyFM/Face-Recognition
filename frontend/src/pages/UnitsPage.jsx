import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronDown, ChevronRight, Home, Info, Layers, LoaderCircle, Search, UserCheck, UserX, X } from 'lucide-react';
import { apiFetch } from '../api';

/**
 * Unit register: projects -> buildings -> units and who owns each one, as
 * supplied by the property manager. Each unit also shows whether anyone from
 * it has registered through STMC. (Coverage stats live on the Enrollments page.)
 */
function Kpi({ icon, tone, label, value }) {
  return (
    <div className="kpi-card glass-panel" style={{ padding: 16 }}>
      <div className="kpi-header" style={{ marginBottom: 12 }}>
        <span className={`kpi-icon ${tone}`}>{icon}</span>
        <div className="lab">{label}</div>
      </div>
      <div className="kpi-body"><div className="val a">{value}</div></div>
    </div>
  );
}

function StmcStatus({ registrations, lang }) {
  if (!registrations?.length) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>{lang ? 'غير مسجل' : 'Not registered'}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {registrations.map((r) => (
        <span key={r.ref} className={`tag ${r.status === 'approved' ? 'closed' : r.status === 'rejected' ? 'watch' : 'open'}`}
          title={`${r.ref} · ${r.name}`} style={{ fontSize: 10 }}>
          {r.residentType === 'tenant' ? (lang ? 'مستأجر' : 'Tenant') : (lang ? 'مالك' : 'Owner')} · {r.status}
        </span>
      ))}
    </div>
  );
}

export default function UnitsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState({});        // collapsed project/building keys

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      apiFetch(`/unit-registry${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
        .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
        .then((result) => { setData(result); setError(''); })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const totals = data?.totals ?? { projects: 0, buildings: 0, units: 0, owned: 0, vacant: 0, withStmc: 0 };
  const toggle = (key) => setClosed((c) => ({ ...c, [key]: !c[key] }));
  const searching = Boolean(query.trim());
  const projects = useMemo(() => data?.projects ?? [], [data]);

  return (
    <>
      <div className="ph">
        <div>
          <h1><Building2 size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.units')}</h1>
          <div className="sub">{lang ? 'سجل المشروعات والمباني والوحدات وملاكها' : 'Register of projects, buildings, units and their owners'}</div>
        </div>
      </div>

      {data?.demo && (
        <div className="panel glass-panel" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, borderColor: 'var(--amber)' }}>
          <Info size={20} color="var(--amber)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13 }}>
            {lang ? 'بيانات تجريبية مؤقتة — سيتم استبدالها بسجل الوحدات الحقيقي.' : 'Sample data — this will be replaced by the real unit register once it is imported.'}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 20 }}>
        <Kpi icon={<Layers size={18} />} tone="blue" label={lang ? 'المشروعات' : 'Projects'} value={totals.projects} />
        <Kpi icon={<Building2 size={18} />} tone="blue" label={lang ? 'المباني' : 'Buildings'} value={totals.buildings} />
        <Kpi icon={<Home size={18} />} tone="blue" label={lang ? 'الوحدات' : 'Units'} value={totals.units} />
        <Kpi icon={<UserCheck size={18} />} tone="green" label={lang ? 'لها مالك' : 'With owner'} value={totals.owned} />
        <Kpi icon={<UserX size={18} />} tone="amber" label={lang ? 'بدون مالك' : 'No owner listed'} value={totals.vacant} />
        <Kpi icon={<UserCheck size={18} />} tone="green" label={lang ? 'مسجلة في STMC' : 'Registered in STMC'} value={totals.withStmc} />
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="search" style={{ minWidth: 320 }}>
          <Search size={14} />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={lang ? 'بحث بالمشروع أو المبنى أو الوحدة أو اسم المالك…' : 'Search project, building, unit or owner name…'} />
          {loading ? <LoaderCircle size={14} className="unit-search-spinner" /> : query ? (
            <X size={14} style={{ cursor: 'pointer' }} onClick={() => setQuery('')} />
          ) : null}
        </div>
      </div>

      {error && <div className="panel glass-panel" style={{ padding: 16, color: 'var(--red)' }}>{lang ? 'تعذر تحميل السجل: ' : 'Could not load the register: '}{error}</div>}
      {!error && data && !projects.length && (
        <div className="sub" style={{ padding: 20 }}>{searching ? (lang ? 'لا نتائج مطابقة.' : 'No matching units.') : (lang ? 'السجل فارغ.' : 'The register is empty.')}</div>
      )}

      {projects.map((p) => {
        const pKey = p.project;
        const pOpen = searching || !closed[pKey];
        const unitCount = p.buildings.reduce((n, b) => n + b.units.length, 0);
        return (
          <div key={pKey} className="panel glass-panel" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
            <div onClick={() => toggle(pKey)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', cursor: 'pointer' }}>
              {pOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <Layers size={18} color="var(--accent)" />
              <b style={{ fontSize: 16 }}>{p.project}</b>
              <span className="sub" style={{ marginInlineStart: 'auto' }}>
                {p.buildings.length} {lang ? 'مباني' : 'buildings'} · {unitCount} {lang ? 'وحدة' : 'units'}
              </span>
            </div>
            {pOpen && p.buildings.map((b) => {
              const bKey = `${pKey}|${b.code}`;
              const bOpen = searching || !closed[bKey];
              return (
                <div key={bKey} style={{ borderTop: '1px solid var(--glass-border)' }}>
                  <div onClick={() => toggle(bKey)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px 10px 40px', cursor: 'pointer' }}>
                    {bOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Building2 size={16} color="var(--accent)" />
                    <b>{b.code}</b>
                    <span className="sub" style={{ marginInlineStart: 'auto' }}>
                      {b.units.length} {lang ? 'وحدة' : 'units'} · {b.units.filter((u) => u.ownerName).length} {lang ? 'لها مالك' : 'with owner'}
                    </span>
                  </div>
                  {bOpen && (
                    <div style={{ overflowX: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th style={{ paddingInlineStart: 64 }}>{lang ? 'الوحدة' : 'Unit'}</th>
                            <th>{lang ? 'اسم المالك' : 'Owner name'}</th>
                            <th>{lang ? 'التسجيل في STMC' : 'STMC registration'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.units.map((u) => (
                            <tr key={u.id}>
                              <td className="mono" style={{ paddingInlineStart: 64, color: '#fff' }}>{u.unit}</td>
                              <td>{u.ownerName ? <b>{u.ownerName}</b> : <span style={{ color: 'var(--muted)' }}>{lang ? 'غير محدد' : 'No owner listed'}</span>}</td>
                              <td><StmcStatus registrations={u.registrations} lang={lang} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

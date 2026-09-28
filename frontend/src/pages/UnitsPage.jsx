import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Camera, ChevronDown, ChevronRight, CheckCircle, Home, Layers,
  LoaderCircle, Search, ShieldAlert, Users, X,
} from 'lucide-react';
import { apiFetch } from '../api';
import { displayName } from '../utils/display';
import { useAuth } from '../context/useAuth';

const SCOPES = [
  { key: 'all', label: 'units.scope_all', icon: <Search size={13} /> },
  { key: 'projects', label: 'units.projects', icon: <Layers size={13} /> },
  { key: 'buildings', label: 'units.buildings', icon: <Building2 size={13} /> },
  { key: 'units', label: 'units.units', icon: <Home size={13} /> },
];

/** Shows why a row matched, rather than leaving the reader to scan for it. */
function Highlight({ text, query }) {
  const value = String(text ?? '');
  const needle = query.trim();
  const at = needle ? value.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at < 0) return <>{value}</>;
  return <>
    {value.slice(0, at)}
    <mark>{value.slice(at, at + needle.length)}</mark>
    {value.slice(at + needle.length)}
  </>;
}

/** Coverage needs a real unit count; without one there is no honest percentage. */
function Coverage({ occupied, total, coverage, lang }) {
  if (coverage === null || coverage === undefined) {
    return <span className="sub" style={{ fontSize: 12 }}>{lang ? 'غير محدد' : 'Not set'}</span>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg2)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${coverage}%`, background: 'var(--green)', transition: 'width 0.4s' }} />
      </div>
      <span className="mono" style={{ fontSize: 12 }}>{occupied}/{total}</span>
    </div>
  );
}

function Kpi({ icon, tone, label, value, hint }) {
  return (
    <div className="kpi-card glass-panel">
      <div className="kpi-header"><span className={`kpi-icon ${tone}`}>{icon}</span><div className="lab">{label}</div></div>
      <div className="kpi-body"><div className={`val ${tone === 'red' ? 'r' : tone === 'green' ? 'g' : 'a'}`}>{value}</div>
        {hint ? <div className="tr">{hint}</div> : null}</div>
    </div>
  );
}

export default function UnitsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const lang = i18n.language === 'ar' ? 1 : 0;

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const searchRef = useRef(null);
  const [data, setData] = useState({ projects: [], totals: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState({});
  const [selected, setSelected] = useState(null);   // { project, code }
  const [faces, setFaces] = useState([]);
  const [editing, setEditing] = useState(null);     // { project, code, totalUnits }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (search, searchScope) => {
    setLoading(true);
    try {
      const response = await apiFetch(
        `/units?q=${encodeURIComponent(search)}&scope=${encodeURIComponent(searchScope)}`);
      if (!response.ok) throw new Error('Could not load units.');
      const result = await response.json();
      setData({ projects: result.projects ?? [], totals: result.totals ?? null });
      setLoadError('');
    } catch (error) {
      setLoadError(error.message || 'Could not load units.');
      setData({ projects: [], totals: null });
    } finally { setLoading(false); }
  }, []);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => load(query, scope), 250);
    return () => window.clearTimeout(timer);
  }, [load, query, scope]);

  // "/" jumps to the search box, the way every search-first page behaves.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    apiFetch('/faces')
      .then((response) => (response.ok ? response.json() : []))
      .then((result) => setFaces(Array.isArray(result) ? result : []))
      .catch(() => setFaces([]));
  }, []);

  // Projects expand by default while searching, so hits are not hidden.
  const expanded = useCallback(
    (project) => (query.trim() ? open[project] !== false : Boolean(open[project])),
    [open, query],
  );

  const building = useMemo(() => {
    if (!selected) return null;
    return data.projects.find((p) => p.project === selected.project)
      ?.buildings.find((b) => b.code === selected.code) ?? null;
  }, [data, selected]);

  const matchCount = useMemo(
    () => data.projects.reduce((sum, project) => sum + project.buildings.length, 0),
    [data],
  );

  const saveTotal = async () => {
    setSaving(true);
    try {
      const response = await apiFetch(`/units/${encodeURIComponent(editing.project)}/${encodeURIComponent(editing.code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalUnits: Number(editing.totalUnits) || 0 }),
      });
      if (!response.ok) throw new Error('Could not save.');
      setEditing(null);
      await load(query, scope);
    } catch (error) { setLoadError(error.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  if (loading && !data.totals) return <div className="panel"><div className="sub"><LoaderCircle size={15} /> Loading units…</div></div>;

  // ---- One building, drilled into.
  if (building) {
    const residents = faces.filter((f) => f.bldg === building.code && (f.type === 'known' || f.type === 'staff'));
    return (
      <>
        <div className="ph">
          <div>
            <h1>{displayName(building, lang, building.code)}</h1>
            <div className="sub">{building.project} · {building.code}</div>
          </div>
        </div>
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <button className="btn ghost sm" onClick={() => setSelected(null)}>← {t('nav.units')}</button>
        </div>
        <div className="kpis">
          <Kpi icon={<Home size={18} />} tone="blue" label={t('units.occupied')} value={building.occupiedUnits}
            hint={building.totalUnits ? `of ${building.totalUnits}` : t('units.unknown_total')} />
          <Kpi icon={<CheckCircle size={18} />} tone="green" label={t('units.enrolled')} value={building.people} />
          <Kpi icon={<Camera size={18} />} tone="blue" label={t('units.cameras')} value={building.cameras}
            hint={`${building.camerasOnline} online`} />
          <Kpi icon={<ShieldAlert size={18} />} tone={building.strangersToday ? 'red' : 'green'}
            label={t('units.strangers_today')} value={building.strangersToday} />
        </div>
        <div className="panel glass-panel" style={{ padding: 0, overflowX: 'auto', border: 'none' }}>
          <table>
            <thead><tr>
              <th>{lang ? 'الوحدة' : 'Unit'}</th>
              <th>{lang ? 'الأشخاص' : 'People'}</th>
              <th>{lang ? 'التسجيلات' : 'Registrations'}</th>
              <th>{lang ? 'معتمد' : 'Approved'}</th>
              <th>{lang ? 'قيد المراجعة' : 'Pending'}</th>
              <th>{lang ? 'وجوه في المعرض' : 'Faces in gallery'}</th>
            </tr></thead>
            <tbody>
              {building.units.length ? building.units.map((unit) => (
                <tr key={unit.unit}>
                  <td className="mono"><b>{unit.unit}</b></td>
                  <td>{unit.people}</td>
                  <td>{unit.enrollments}</td>
                  <td>{unit.approved}</td>
                  <td>{unit.pending ? <span className="tag watch">{unit.pending}</span> : 0}</td>
                  <td>{unit.faces}</td>
                </tr>
              )) : <tr><td colSpan={6} className="sub">
                {lang ? 'لا توجد وحدات مسجّلة بعد في هذا المبنى.' : 'No units registered in this building yet.'}
              </td></tr>}
            </tbody>
          </table>
        </div>
        <div className="panel glass-panel" style={{ marginTop: 16 }}>
          <h3><Users size={18} color="var(--green)" /> {lang ? 'المسجّلون في هذا المبنى' : 'Enrolled in this building'}</h3>
          <table>
            <thead><tr><th>Face</th><th>{lang ? 'الاسم' : 'Name'}</th><th>{lang ? 'الوحدة' : 'Unit'}</th></tr></thead>
            <tbody>
              {residents.length ? residents.map((face) => (
                <tr key={face.id} onClick={() => navigate('/track')} style={{ cursor: 'pointer' }}>
                  <td className="mono" style={{ color: '#fff' }}>{face.id}</td>
                  <td>{displayName(face, lang, face.id)}</td>
                  <td className="mono">{face.unit || '—'}</td>
                </tr>
              )) : <tr><td colSpan={3} className="sub">None yet</td></tr>}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ---- Project / building tree.
  const totals = data.totals ?? { projects: 0, buildings: 0, occupiedUnits: 0, people: 0, strangersToday: 0 };
  return (
    <>
      <div className="ph">
        <div><h1>{t('nav.units')}</h1><div className="sub">{t('units.subtitle')}</div></div>
      </div>

      <div className="kpis">
        <Kpi icon={<Layers size={18} />} tone="blue" label={t('units.projects')} value={totals.projects} />
        <Kpi icon={<Building2 size={18} />} tone="blue" label={t('units.buildings')} value={totals.buildings} />
        <Kpi icon={<Home size={18} />} tone="blue" label={t('units.occupied')} value={totals.occupiedUnits}
          hint={totals.totalUnits ? `of ${totals.totalUnits}` : t('units.unknown_total')} />
        <Kpi icon={<CheckCircle size={18} />} tone="green" label={t('units.enrolled')} value={totals.people} />
      </div>

      <div className="unit-search">
        <div className="unit-search-field">
          <Search size={17} className="unit-search-icon" aria-hidden="true" />
          <input ref={searchRef} type="text" value={query} autoComplete="off" spellCheck="false"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { setQuery(''); event.currentTarget.blur(); } }}
            placeholder={t('units.search')} aria-label={t('units.search')} />
          {loading ? <LoaderCircle size={16} className="unit-search-spinner" aria-hidden="true" /> : null}
          {query ? (
            <button type="button" className="unit-search-clear" onClick={clearSearch}
              aria-label={lang ? 'Clear search' : 'Clear search'}><X size={15} /></button>
          ) : <kbd className="unit-search-kbd" aria-hidden="true">/</kbd>}
        </div>
        <div className="unit-search-scopes" role="group" aria-label="Search scope">
          {SCOPES.map((option) => (
            <button key={option.key} type="button" aria-pressed={scope === option.key}
              className={`unit-scope ${scope === option.key ? 'on' : ''}`}
              onClick={() => setScope(option.key)}>
              {option.icon} {t(option.label)}
            </button>
          ))}
        </div>
      </div>

      {/* What the search actually found, so an empty screen is never ambiguous. */}
      {query.trim() ? (
        <div className="unit-search-summary">
          {matchCount ? (
            <span>
              <b>{matchCount}</b> {matchCount === 1 ? t('units.match') : t('units.matches')}
              {' '}{lang ? '\u0644\u0640' : 'for'} <mark>{query.trim()}</mark>
              {' \u00b7 '}{totals.buildings} {t('units.buildings')} / {totals.projects} {t('units.projects')}
            </span>
          ) : <span>{t('units.no_results')}</span>}
          <button type="button" className="btn ghost sm" onClick={clearSearch}>{t('units.clear')}</button>
        </div>
      ) : null}

      {loadError ? <div className="note" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{loadError}</div> : null}

      {!data.projects.length && !loading ? (
        <div className="unit-empty">
          <Search size={26} aria-hidden="true" />
          <b>{query.trim() ? t('units.no_results') : t('units.no_projects')}</b>
          <span>{query.trim() ? t('units.search_hint') : t('units.no_projects_hint')}</span>
          {query.trim()
            ? <button type="button" className="btn ghost sm" onClick={clearSearch}>{t('units.clear')}</button>
            : null}
        </div>
      ) : null}

      {data.projects.map((project) => (
        <section className="wall-group" key={project.project}>
          <button type="button" className="wall-group-head" aria-expanded={expanded(project.project)}
            onClick={() => setOpen((current) => ({ ...current, [project.project]: !expanded(project.project) }))}>
            {expanded(project.project) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Layers size={15} />
            <b><Highlight text={project.project} query={query} /></b>
            <span className="wall-group-meta">
              {project.buildings.length} {t('units.buildings')} · {project.occupiedUnits} {t('units.occupied')} · {project.people} {t('units.enrolled')}
            </span>
          </button>
          {expanded(project.project) && (
            <div className="panel glass-panel" style={{ padding: 0, overflowX: 'auto', border: 'none' }}>
              <table>
                <thead><tr>
                  <th>{lang ? 'المبنى' : 'Building'}</th>
                  <th>{t('units.occupied')}</th>
                  <th>{t('units.coverage')}</th>
                  <th>{t('units.enrolled')}</th>
                  <th>{t('units.cameras')}</th>
                  <th>{t('units.strangers_today')}</th>
                  <th />
                </tr></thead>
                <tbody>
                  {project.buildings.map((row) => (
                    <tr key={row.code} style={{ cursor: 'pointer' }}
                      onClick={() => setSelected({ project: row.project, code: row.code })}>
                      <td>
                        <b><Highlight text={displayName(row, lang, row.code)} query={query} /></b>
                        {/* Which units matched, so a hit is visible without drilling in. */}
                        {query.trim() && row.matchedUnits ? (
                          <div className="unit-hit-list">
                            {row.units.slice(0, 6).map((unit) => (
                              <span className="unit-hit" key={unit.unit}>
                                <Highlight text={unit.unit} query={query} />
                              </span>
                            ))}
                            {row.units.length > 6
                              ? <span className="unit-hit more">+{row.units.length - 6}</span> : null}
                          </div>
                        ) : null}
                      </td>
                      <td>{row.occupiedUnits}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {editing && editing.project === row.project && editing.code === row.code ? (
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="number" min="0" value={editing.totalUnits} style={{ width: 80 }}
                              onChange={(event) => setEditing({ ...editing, totalUnits: event.target.value })} />
                            <button className="btn sm" disabled={saving} onClick={saveTotal}>Save</button>
                            <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                          </span>
                        ) : (
                          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Coverage occupied={row.occupiedUnits} total={row.totalUnits} coverage={row.coverage} lang={lang} />
                            {canEdit('units') ? (
                              <button className="btn ghost sm" title={t('units.set_total')}
                                onClick={() => setEditing({ project: row.project, code: row.code, totalUnits: row.totalUnits })}>
                                {t('units.set_total')}
                              </button>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td>{row.people}</td>
                      <td>{row.cameras}</td>
                      <td>{row.strangersToday
                        ? <span className="tag watch">{row.strangersToday}</span>
                        : <span className="tag known">0</span>}</td>
                      <td><ChevronRight size={16} style={{ color: 'var(--muted)' }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <div className="note" style={{ marginTop: 16 }}>
        {lang
          ? 'المشاريع والمباني تأتي من الكاميرات المضافة، والوحدات تأتي من تسجيلات السكان. لا توجد بيانات تجريبية هنا.'
          : 'Projects and buildings come from the cameras you have added; units come from resident enrolments. Nothing here is demo data.'}
      </div>
    </>
  );
}

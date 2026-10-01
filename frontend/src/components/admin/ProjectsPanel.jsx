import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Check, DoorOpen, Eye, EyeOff, Layers, LoaderCircle, Pencil,
  Plus, Search, Trash2, TriangleAlert, Users, X,
} from 'lucide-react';
import { apiFetch } from '../../api';
import BulkAddDialog from './BulkAddDialog';
import UnitsDialog from './UnitsDialog';

/**
 * Projects, their buildings, and the units inside them.
 *
 * This is where the enrolment form gets its dropdowns: a resident can only
 * pick a project, building and unit that exists here, so nothing can be
 * mistyped. Laid out master-detail rather than as stacked accordions --
 * one project is in focus at a time, and its buildings get the whole width
 * instead of being squeezed under a disclosure triangle.
 */
export default function ProjectsPanel({ lang }) {
  const [projects, setProjects] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [newProject, setNewProject] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [newBuilding, setNewBuilding] = useState({ code: '', totalUnits: '' });
  const [bulkBuildings, setBulkBuildings] = useState(false);
  const [unitsFor, setUnitsFor] = useState(null);
  const [bulkUnits, setBulkUnits] = useState(null);

  const load = useCallback(async () => {
    try {
      const [projectResponse, treeResponse] = await Promise.all([apiFetch('/units/projects'), apiFetch('/units')]);
      if (!projectResponse.ok || !treeResponse.ok) throw new Error('Could not load projects.');
      const [projectList, treeData] = await Promise.all([projectResponse.json(), treeResponse.json()]);
      setProjects(Array.isArray(projectList) ? projectList : []);
      setTree(treeData.projects ?? []);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not load projects.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const buildingsOf = useCallback(
    (name) => tree.find((row) => row.project === name)?.buildings ?? [], [tree]);

  // Keep a selection once projects arrive, and recover if the selected one
  // is renamed or deleted underneath us.
  useEffect(() => {
    if (!projects.length) { setSelected(null); return; }
    if (!projects.some((project) => project.name === selected)) setSelected(projects[0].name);
  }, [projects, selected]);

  /** Every write goes through here so a rejected change always shows why. */
  const send = async (path, options) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(Array.isArray(body.message) ? body.message.join(', ')
          : body.message || 'That change was rejected.');
      }
      await load();
      return true;
    } catch (writeError) {
      setError(writeError.message);
      return false;
    } finally { setBusy(false); }
  };

  const path = (project, code) => `/units/${encodeURIComponent(project)}/${encodeURIComponent(code)}`;
  const projectPath = (name) => `/units/projects/${encodeURIComponent(name)}`;

  const addProject = async (event) => {
    event.preventDefault();
    const name = newProject.trim();
    if (!name) return;
    if (await send('/units/projects', { method: 'POST', body: JSON.stringify({ name }) })) {
      setNewProject('');
      setSelected(name);
    }
  };

  const saveRename = async () => {
    const next = renaming.value.trim();
    if (!next || next === renaming.name) return setRenaming(null);
    if (await send(projectPath(renaming.name), { method: 'PATCH', body: JSON.stringify({ name: next }) })) {
      setSelected(next);
      setRenaming(null);
    }
  };

  const addBuilding = async (event) => {
    event.preventDefault();
    const code = newBuilding.code.trim();
    if (!code) return;
    const ok = await send(`${projectPath(selected)}/buildings`, {
      method: 'POST',
      body: JSON.stringify({ code, totalUnits: Number(newBuilding.totalUnits) || 0 }),
    });
    if (ok) setNewBuilding({ code: '', totalUnits: '' });
  };

  const addBuildingsBulk = async (codes, unitsEach) => {
    const ok = await send(`${projectPath(selected)}/buildings/bulk`, {
      method: 'POST',
      body: JSON.stringify({
        buildings: codes.map((code) => ({ code, ...(unitsEach ? { totalUnits: unitsEach } : {}) })),
      }),
    });
    if (ok) setBulkBuildings(false);
  };

  const addUnitsBulk = async (codes) => {
    const ok = await send(`${path(bulkUnits.project, bulkUnits.code)}/units`, {
      method: 'POST', body: JSON.stringify({ units: codes }),
    });
    if (ok) setBulkUnits(null);
  };

  const removeUnit = (project, code, unit) =>
    send(`${path(project, code)}/units/${encodeURIComponent(unit)}`, { method: 'DELETE' });

  const setUnitOwner = (project, code, unit, owner) =>
    send(`${path(project, code)}/units/${encodeURIComponent(unit)}/owner`, {
      method: 'PUT', body: JSON.stringify({ owner }),
    });

  const findBuilding = (ref) => ref && buildingsOf(ref.project).find((row) => row.code === ref.code);

  const shownProjects = useMemo(() => projects.filter(
    (project) => project.name.toLowerCase().includes(projectSearch.toLowerCase())), [projects, projectSearch]);

  const current = projects.find((project) => project.name === selected);
  const buildings = useMemo(() => (selected ? buildingsOf(selected) : []), [selected, buildingsOf]);

  const totals = useMemo(() => buildings.reduce((sum, building) => {
    const units = building.units ?? [];
    return {
      units: sum.units + units.length,
      owned: sum.owned + units.filter((unit) => unit.owner).length,
      cameras: sum.cameras + (building.cameras ?? 0),
    };
  }, { units: 0, owned: 0, cameras: 0 }), [buildings]);

  if (loading) {
    return <div className="panel glass-panel"><div className="sub">
      <LoaderCircle size={14} /> {lang ? 'جاري التحميل…' : 'Loading projects…'}
    </div></div>;
  }

  return (
    <>
      {error ? (
        <div className="panel glass-panel places-error">
          <TriangleAlert size={15} /> <span>{error}</span>
          <button className="btn ghost sm" onClick={() => setError('')}><X size={13} /></button>
        </div>
      ) : null}

      <div className="places">
        {/* ── Projects ─────────────────────────────────────── */}
        <aside className="places-aside panel glass-panel">
          <div className="places-aside-head">
            <h3><Layers size={16} color="var(--accent)" /> {lang ? 'المشاريع' : 'Projects'}</h3>
            <span className="tag closed">{projects.length}</span>
          </div>

          {projects.length > 6 && (
            <div className="search" style={{ marginBottom: 10 }}>
              <Search size={13} />
              <input type="text" value={projectSearch} placeholder={lang ? 'بحث…' : 'Search…'}
                onChange={(event) => setProjectSearch(event.target.value)} />
            </div>
          )}

          <div className="places-list">
            {shownProjects.map((project) => {
              const rows = buildingsOf(project.name);
              const units = rows.reduce((sum, row) => sum + (row.units?.length ?? 0), 0);
              return (
                <button key={project.name} type="button"
                  className={`places-item ${selected === project.name ? 'on' : ''} ${project.active ? '' : 'muted'}`}
                  onClick={() => setSelected(project.name)}>
                  <span className="places-item-name">
                    {project.name}
                    {!project.active && <EyeOff size={12} />}
                  </span>
                  <span className="places-item-meta">
                    {rows.length} {lang ? 'مبنى' : rows.length === 1 ? 'building' : 'buildings'}
                    {units ? ` · ${units} ${lang ? 'وحدة' : 'units'}` : ''}
                  </span>
                </button>
              );
            })}
            {!shownProjects.length && (
              <div className="hint" style={{ padding: '10px 2px' }}>
                {projects.length ? (lang ? 'لا نتائج.' : 'No match.') : (lang ? 'لا توجد مشاريع بعد.' : 'No projects yet.')}
              </div>
            )}
          </div>

          <form className="places-add" onSubmit={addProject}>
            <input type="text" value={newProject} placeholder={lang ? 'اسم مشروع جديد' : 'New project name'}
              onChange={(event) => setNewProject(event.target.value)} />
            <button className="btn sm" type="submit" disabled={busy || !newProject.trim()}>
              <Plus size={13} />
            </button>
          </form>
        </aside>

        {/* ── Buildings of the selected project ────────────── */}
        <section className="places-main panel glass-panel">
          {!current ? (
            <div className="places-empty">
              <Layers size={30} />
              <b>{lang ? 'ابدأ بإضافة مشروع' : 'Start by adding a project'}</b>
              <span>{lang
                ? 'المشروع يحتوي المباني، والمباني تحتوي الوحدات التي يختارها الساكن عند التسجيل.'
                : 'A project holds buildings, and buildings hold the units a resident picks during registration.'}</span>
            </div>
          ) : (
            <>
              <div className="places-head">
                {renaming?.name === current.name ? (
                  <div className="places-rename">
                    <input type="text" value={renaming.value} autoFocus
                      onChange={(event) => setRenaming({ ...renaming, value: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveRename();
                        if (event.key === 'Escape') setRenaming(null);
                      }} />
                    <button className="btn sm" disabled={busy} onClick={saveRename}><Check size={13} /></button>
                    <button className="btn ghost sm" onClick={() => setRenaming(null)}><X size={13} /></button>
                  </div>
                ) : (
                  <>
                    <div>
                      <h3 style={{ margin: 0 }}>{current.name}</h3>
                      <div className="places-sub">
                        {current.active
                          ? (lang ? 'ظاهر في نموذج التسجيل' : 'Offered in the registration form')
                          : (lang ? 'مخفي عن التسجيل' : 'Hidden from registration')}
                      </div>
                    </div>
                    <div className="grow" />
                    <button className="btn ghost sm" title={lang ? 'إعادة تسمية' : 'Rename'}
                      onClick={() => setRenaming({ name: current.name, value: current.name })}>
                      <Pencil size={13} />
                    </button>
                    <button className="btn ghost sm" disabled={busy}
                      title={current.active ? (lang ? 'إخفاء' : 'Hide from registration') : (lang ? 'إظهار' : 'Show in registration')}
                      onClick={() => send(projectPath(current.name), {
                        method: 'PATCH', body: JSON.stringify({ active: !current.active }),
                      })}>
                      {current.active ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button className="btn ghost sm" disabled={busy} title={lang ? 'حذف' : 'Delete'}
                      onClick={() => {
                        if (!window.confirm(lang
                          ? `حذف «${current.name}» وكل مبانيه؟`
                          : `Delete "${current.name}" and its buildings? This cannot be undone.`)) return;
                        send(projectPath(current.name), { method: 'DELETE' });
                      }}>
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>

              <div className="places-stats">
                <div><b>{buildings.length}</b><span>{lang ? 'مبانٍ' : 'buildings'}</span></div>
                <div><b>{totals.units}</b><span>{lang ? 'وحدات' : 'units'}</span></div>
                <div><b style={{ color: totals.owned ? 'var(--green)' : undefined }}>{totals.owned}</b><span>{lang ? 'لها مالك' : 'with an owner'}</span></div>
                <div><b>{totals.cameras}</b><span>{lang ? 'كاميرات' : 'cameras'}</span></div>
              </div>

              <div className="places-table">
                <table>
                  <thead><tr>
                    <th>{lang ? 'المبنى' : 'Building'}</th>
                    <th>{lang ? 'الوحدات' : 'Units'}</th>
                    <th>{lang ? 'المُلاك' : 'Owners'}</th>
                    <th>{lang ? 'كاميرات' : 'Cameras'}</th>
                    <th />
                  </tr></thead>
                  <tbody>
                    {buildings.length ? buildings.map((building) => {
                      const units = building.units ?? [];
                      const owned = units.filter((row) => row.owner).length;
                      return (
                        <tr key={building.code}>
                          <td><b>{building.code}</b></td>
                          <td>
                            {units.length ? (
                              <button className="adm-units-btn"
                                onClick={() => setUnitsFor({ project: current.name, code: building.code })}>
                                {units.length} <DoorOpen size={11} />
                              </button>
                            ) : (
                              <button className="adm-units-btn"
                                onClick={() => setBulkUnits({ project: current.name, code: building.code })}>
                                <span className="adm-warn">{lang ? 'لا وحدات — أضف' : 'none — add'}</span>
                              </button>
                            )}
                          </td>
                          <td>
                            {units.length ? (
                              <span className="adm-occupancy">
                                <span className="adm-occupancy-bar">
                                  <span style={{ width: `${Math.round((owned / units.length) * 100)}%` }} />
                                </span>
                                <span className="mono">{owned}/{units.length}</span>
                              </span>
                            ) : <span className="sub">—</span>}
                          </td>
                          <td>
                            {building.cameras
                              ? <span className="mono">{building.camerasOnline}/{building.cameras}</span>
                              : <span className="sub">0</span>}
                          </td>
                          <td>
                            <div className="places-row-actions">
                              <button className="btn ghost sm" title={lang ? 'الوحدات والمُلاك' : 'Units & owners'}
                                onClick={() => setUnitsFor({ project: current.name, code: building.code })}>
                                <Users size={13} />
                              </button>
                              <button className="btn ghost sm" disabled={busy} title={lang ? 'حذف' : 'Delete'}
                                onClick={() => {
                                  if (!window.confirm(lang ? `حذف المبنى «${building.code}»؟` : `Delete building "${building.code}"?`)) return;
                                  send(`${projectPath(current.name)}/buildings/${encodeURIComponent(building.code)}`, { method: 'DELETE' });
                                }}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={5}>
                        <div className="places-empty small">
                          <Building2 size={22} />
                          <b>{lang ? 'لا توجد مبانٍ بعد' : 'No buildings yet'}</b>
                          <span>{lang ? 'أضف مبنى واحداً أو دفعة كاملة.' : 'Add one, or generate a whole batch.'}</span>
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <form className="places-add-building" onSubmit={addBuilding}>
                <Building2 size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <input type="text" value={newBuilding.code}
                  placeholder={lang ? 'كود المبنى، مثل 4.6-C' : 'Building code, e.g. 4.6-C'}
                  onChange={(event) => setNewBuilding({ ...newBuilding, code: event.target.value })} />
                <input type="number" min="0" value={newBuilding.totalUnits} className="places-units-input"
                  placeholder={lang ? 'وحدات' : 'Units'}
                  onChange={(event) => setNewBuilding({ ...newBuilding, totalUnits: event.target.value })} />
                <button className="btn sm" type="submit" disabled={busy || !newBuilding.code.trim()}>
                  <Plus size={13} /> {lang ? 'إضافة' : 'Add'}
                </button>
                <button className="btn ghost sm" type="button" onClick={() => setBulkBuildings(true)}>
                  <Layers size={13} /> {lang ? 'دفعة' : 'Add many'}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {bulkBuildings && selected && (
        <BulkAddDialog kind="building" lang={lang} busy={busy}
          existing={buildings.map((building) => building.code)}
          title={lang ? `إضافة مبانٍ إلى ${selected}` : `Add buildings to ${selected}`}
          subtitle={lang
            ? 'ولّد أكواد المباني دفعة واحدة. الموجود مسبقاً يُتخطى.'
            : 'Generate building codes in one go. Codes that already exist are skipped.'}
          onCancel={() => setBulkBuildings(false)} onAdd={addBuildingsBulk} />
      )}

      {bulkUnits && (
        <BulkAddDialog kind="unit" lang={lang} busy={busy}
          existing={(findBuilding(bulkUnits)?.units ?? []).map((unit) => unit.unit)}
          title={lang ? `إضافة وحدات إلى ${bulkUnits.code}` : `Add units to ${bulkUnits.code}`}
          subtitle={lang
            ? 'هذه الأكواد هي ما يختاره الساكن عند التسجيل.'
            : 'These codes are what a resident picks from during registration.'}
          onCancel={() => setBulkUnits(null)} onAdd={addUnitsBulk} />
      )}

      {unitsFor && findBuilding(unitsFor) && (
        <UnitsDialog lang={lang} busy={busy}
          project={unitsFor.project} building={findBuilding(unitsFor)}
          onClose={() => setUnitsFor(null)}
          onBulkAdd={() => setBulkUnits(unitsFor)}
          onRemoveUnit={(unit) => removeUnit(unitsFor.project, unitsFor.code, unit)}
          onSetOwner={(unit, owner) => setUnitOwner(unitsFor.project, unitsFor.code, unit, owner)} />
      )}
    </>
  );
}

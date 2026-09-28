import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Check, ChevronDown, ChevronRight, Eye, EyeOff, Layers, LoaderCircle, Pencil,
  Plus, Trash2, X,
} from 'lucide-react';
import { apiFetch } from '../../api';

/**
 * Projects, their buildings and how many units each holds.
 *
 * This is where the enrolment form gets its dropdowns: a resident can only
 * pick a project, building and unit that exists here, so nothing can be
 * mistyped. A building with no unit count offers nothing, which is why the
 * panel calls that out rather than leaving registration quietly closed.
 */
export default function ProjectsPanel({ lang }) {
  const [projects, setProjects] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});
  const [newProject, setNewProject] = useState('');
  const [renaming, setRenaming] = useState(null);      // { name, value }
  const [newBuilding, setNewBuilding] = useState({});  // project -> { code, totalUnits }
  const [editingUnits, setEditingUnits] = useState(null); // { project, code, value }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projectResponse, treeResponse] = await Promise.all([
        apiFetch('/units/projects'),
        apiFetch('/units'),
      ]);
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

  /** Every write goes through here so a rejected change always shows why. */
  const send = async (path, options) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(path, {
        headers: { 'Content-Type': 'application/json' }, ...options,
      });
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

  const buildingsOf = (name) => tree.find((row) => row.project === name)?.buildings ?? [];

  const addProject = async (event) => {
    event.preventDefault();
    if (!newProject.trim()) return;
    if (await send('/units/projects', { method: 'POST', body: JSON.stringify({ name: newProject.trim() }) })) {
      setNewProject('');
    }
  };

  const saveRename = async () => {
    const next = renaming.value.trim();
    if (!next || next === renaming.name) return setRenaming(null);
    if (await send(`/units/projects/${encodeURIComponent(renaming.name)}`,
      { method: 'PATCH', body: JSON.stringify({ name: next }) })) setRenaming(null);
  };

  const addBuilding = async (event, name) => {
    event.preventDefault();
    const draft = newBuilding[name] ?? {};
    if (!draft.code?.trim()) return;
    const ok = await send(`/units/projects/${encodeURIComponent(name)}/buildings`, {
      method: 'POST',
      body: JSON.stringify({
        code: draft.code.trim(),
        totalUnits: Number(draft.totalUnits) || 0,
      }),
    });
    if (ok) setNewBuilding((current) => ({ ...current, [name]: { code: '', totalUnits: '' } }));
  };

  const saveUnits = async () => {
    const ok = await send(
      `/units/${encodeURIComponent(editingUnits.project)}/${encodeURIComponent(editingUnits.code)}`,
      { method: 'PATCH', body: JSON.stringify({ totalUnits: Number(editingUnits.value) || 0 }) });
    if (ok) setEditingUnits(null);
  };

  if (loading) {
    return <div className="panel glass-panel"><div className="sub">
      <LoaderCircle size={14} /> {lang ? 'جاري التحميل…' : 'Loading projects…'}
    </div></div>;
  }

  return (
    <div className="panel glass-panel">
      <h3><Layers size={18} color="var(--accent)" /> {lang ? 'المشاريع والمباني' : 'Projects & buildings'}</h3>
      <p className="sub" style={{ marginTop: -8, marginBottom: 14, fontSize: 12 }}>
        {lang
          ? 'ما يظهر في نموذج التسجيل. المبنى بدون عدد وحدات لا يظهر للسكان.'
          : 'This is what the registration form offers. A building with no unit count is not shown to residents.'}
      </p>

      {error ? <div className="note" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{error}</div> : null}

      {projects.map((project) => {
        const buildings = buildingsOf(project.name);
        const shut = !open[project.name];
        const draft = newBuilding[project.name] ?? { code: '', totalUnits: '' };
        return (
          <div className="adm-project" key={project.name}>
            <div className="adm-project-head">
              <button type="button" className="adm-disclose"
                onClick={() => setOpen((c) => ({ ...c, [project.name]: shut }))}
                aria-expanded={!shut} aria-label={project.name}>
                {shut ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              </button>

              {renaming?.name === project.name ? (
                <>
                  <input type="text" value={renaming.value} autoFocus
                    onChange={(event) => setRenaming({ ...renaming, value: event.target.value })}
                    onKeyDown={(event) => { if (event.key === 'Enter') saveRename(); if (event.key === 'Escape') setRenaming(null); }} />
                  <button className="btn sm" disabled={busy} onClick={saveRename}><Check size={13} /></button>
                  <button className="btn ghost sm" onClick={() => setRenaming(null)}><X size={13} /></button>
                </>
              ) : (
                <>
                  <b className={project.active ? '' : 'adm-inactive'}>{project.name}</b>
                  <span className="adm-meta">
                    {buildings.length} {lang ? 'مبنى' : buildings.length === 1 ? 'building' : 'buildings'}
                    {project.active ? '' : ` · ${lang ? 'مخفي' : 'hidden from registration'}`}
                  </span>
                  <button className="btn ghost sm" title={lang ? 'إعادة تسمية' : 'Rename'}
                    onClick={() => setRenaming({ name: project.name, value: project.name })}>
                    <Pencil size={13} />
                  </button>
                  <button className="btn ghost sm" disabled={busy}
                    title={project.active ? (lang ? 'إخفاء' : 'Hide from registration') : (lang ? 'إظهار' : 'Show in registration')}
                    onClick={() => send(`/units/projects/${encodeURIComponent(project.name)}`,
                      { method: 'PATCH', body: JSON.stringify({ active: !project.active }) })}>
                    {project.active ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button className="btn ghost sm" disabled={busy} title={lang ? 'حذف' : 'Delete'}
                    onClick={() => {
                      if (!window.confirm(lang
                        ? `حذف «${project.name}» وكل مبانيه؟`
                        : `Delete "${project.name}" and its buildings? This cannot be undone.`)) return;
                      send(`/units/projects/${encodeURIComponent(project.name)}`, { method: 'DELETE' });
                    }}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>

            {!shut && (
              <div className="adm-buildings">
                <table>
                  <thead><tr>
                    <th>{lang ? 'المبنى' : 'Building'}</th>
                    <th>{lang ? 'عدد الوحدات' : 'Units'}</th>
                    <th>{lang ? 'كاميرات' : 'Cameras'}</th>
                    <th />
                  </tr></thead>
                  <tbody>
                    {buildings.length ? buildings.map((building) => (
                      <tr key={building.code}>
                        <td><b>{building.code}</b></td>
                        <td>
                          {editingUnits?.project === project.name && editingUnits?.code === building.code ? (
                            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input type="number" min="0" style={{ width: 80 }} autoFocus
                                value={editingUnits.value}
                                onChange={(event) => setEditingUnits({ ...editingUnits, value: event.target.value })}
                                onKeyDown={(event) => { if (event.key === 'Enter') saveUnits(); if (event.key === 'Escape') setEditingUnits(null); }} />
                              <button className="btn sm" disabled={busy} onClick={saveUnits}><Check size={13} /></button>
                              <button className="btn ghost sm" onClick={() => setEditingUnits(null)}><X size={13} /></button>
                            </span>
                          ) : (
                            <button className="adm-units-btn"
                              onClick={() => setEditingUnits({ project: project.name, code: building.code, value: building.totalUnits })}>
                              {building.totalUnits
                                ? <>{building.totalUnits} <Pencil size={11} /></>
                                : <span className="adm-warn">{lang ? 'غير محدد — اضغط للتحديد' : 'not set — click to set'}</span>}
                            </button>
                          )}
                        </td>
                        <td>{building.cameras}</td>
                        <td>
                          <button className="btn ghost sm" disabled={busy} title={lang ? 'حذف' : 'Delete'}
                            onClick={() => {
                              if (!window.confirm(lang ? `حذف المبنى «${building.code}»؟` : `Delete building "${building.code}"?`)) return;
                              send(`/units/projects/${encodeURIComponent(project.name)}/buildings/${encodeURIComponent(building.code)}`,
                                { method: 'DELETE' });
                            }}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="sub">
                        {lang ? 'لا توجد مبانٍ بعد.' : 'No buildings yet.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>

                <form className="adm-add-row" onSubmit={(event) => addBuilding(event, project.name)}>
                  <Building2 size={14} style={{ color: 'var(--muted)' }} />
                  <input type="text" value={draft.code} placeholder={lang ? 'كود المبنى، مثل 4.6-C' : 'Building code, e.g. 4.6-C'}
                    onChange={(event) => setNewBuilding((c) => ({ ...c, [project.name]: { ...draft, code: event.target.value } }))} />
                  <input type="number" min="0" value={draft.totalUnits} placeholder={lang ? 'عدد الوحدات' : 'Units'}
                    style={{ width: 110 }}
                    onChange={(event) => setNewBuilding((c) => ({ ...c, [project.name]: { ...draft, totalUnits: event.target.value } }))} />
                  <button className="btn sm" type="submit" disabled={busy || !draft.code.trim()}>
                    <Plus size={13} /> {lang ? 'إضافة مبنى' : 'Add building'}
                  </button>
                </form>
              </div>
            )}
          </div>
        );
      })}

      {!projects.length ? (
        <div className="sub" style={{ padding: '10px 0' }}>
          {lang ? 'لا توجد مشاريع بعد. أضف أول مشروع بالأسفل.' : 'No projects yet. Add your first one below.'}
        </div>
      ) : null}

      <form className="adm-add-row adm-add-project" onSubmit={addProject}>
        <Layers size={14} style={{ color: 'var(--muted)' }} />
        <input type="text" value={newProject} placeholder={lang ? 'اسم المشروع' : 'Project name, e.g. West Town Residence'}
          onChange={(event) => setNewProject(event.target.value)} />
        <button className="btn" type="submit" disabled={busy || !newProject.trim()}>
          <Plus size={14} /> {lang ? 'إضافة مشروع' : 'Add project'}
        </button>
      </form>
    </div>
  );
}

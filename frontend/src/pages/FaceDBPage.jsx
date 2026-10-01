import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Car, Search, ShieldAlert, Trash2, Upload, User, UserX, Users, X } from 'lucide-react';
import { apiFetch } from '../api';
import { displayName } from '../utils/display';
import { useAuth } from '../context/useAuth';

const CSV_COLUMNS = [
  ['Face ID', f => f.id],
  ['Name', f => (Array.isArray(f.name) ? f.name[0] : f.name) ?? ''],
  ['Tier', f => f.type ?? ''],
  ['Role', f => (Array.isArray(f.role) ? f.role[0] : f.role) ?? ''],
  ['Building', f => f.bldg ?? ''],
  ['Unit', f => f.unit ?? ''],
  ['National ID', f => f.idno ?? ''],
  ['Detections', f => f.detections ?? 0],
  ['In AI gallery', f => (f.inGallery === false ? 'no' : 'yes')],
];

/** Exports exactly the rows the filters are showing. */
function exportCsv(rows, lang) {
  const csv = [CSV_COLUMNS.map(([heading]) => heading)]
    .concat(rows.map(row => CSV_COLUMNS.map(([, read]) => read(row))))
    .map(cells => cells.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
  // The BOM makes Excel read the Arabic names as UTF-8 rather than mojibake.
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `face-database-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  void lang;
}

export default function FaceDBPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [building, setBuilding] = useState('');
  const [unit, setUnit] = useState('');
  const [FACES, setFaces] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);   // full record from GET /faces/:id
  const [loadingId, setLoadingId] = useState(null);
  // Removing somebody is irreversible and reaches further than one row, so
  // the confirmation says exactly who goes before anything happens.
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(() => apiFetch('/faces')
    .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(data => { setFaces(data); setError(''); })
    .catch(err => setError(err.message)), []);

  useEffect(() => { load(); }, [load]);

  const openFace = async (id) => {
    setLoadingId(id);
    try {
      const res = await apiFetch(`/faces/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(await res.json());
    } catch (err) {
      alert((lang ? 'تعذر تحميل بيانات الشخص: ' : 'Could not load this person: ') + err.message);
    } finally {
      setLoadingId(null);
    }
  };

  // Options come from the records actually present, so a filter can never
  // offer a value that returns nothing.
  const buildings = [...new Set(FACES.map(f => f.bldg).filter(Boolean))].sort();
  const units = [...new Set(FACES
    .filter(f => !building || f.bldg === building)
    .map(f => f.unit).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const filtered = FACES.filter(f => {
    const bucket = (f.type === 'known' || f.type === 'staff') ? 'owner' : f.type === 'unknown' ? 'stranger' : 'watch';
    if (!(filter === 'all' || filter === bucket || filter === f.type)) return false;
    if (building && f.bldg !== building) return false;
    if (unit && f.unit !== unit) return false;

    const nameStr = Array.isArray(f.name) ? f.name.join(' ') : (f.name || '');
    const roleStr = Array.isArray(f.role) ? f.role.join(' ') : (f.role || '');
    const q = (f.id + nameStr + (f.idno || '') + roleStr + (f.bldg || '') + (f.unit || '')).toLowerCase();
    return q.includes(search.toLowerCase());
  });

  const bucketOf = (f) => (f.type === 'known' || f.type === 'staff') ? 'owner'
    : f.type === 'unknown' ? 'stranger' : 'watch';
  const present = new Set(FACES.map(bucketOf));
  const staffCount = FACES.filter(f => f.type === 'staff').length;
  const tierChips = [
    ['all', lang ? 'الكل' : 'All', FACES.length],
    ...(present.has('owner') ? [['owner', lang ? 'المقيمون' : 'Residents', FACES.filter(f => bucketOf(f) === 'owner').length]] : []),
    ...(staffCount ? [['staff', lang ? 'الموظفون' : 'Staff', staffCount]] : []),
    ...(present.has('stranger') ? [['stranger', lang ? 'الغرباء' : 'Strangers', FACES.filter(f => bucketOf(f) === 'stranger').length]] : []),
    ...(present.has('watch') ? [['watch', lang ? 'قائمة المراقبة' : 'Watchlist', FACES.filter(f => bucketOf(f) === 'watch').length]] : []),
  ];

  const activeFilters = (filter !== 'all' ? 1 : 0) + (building ? 1 : 0) + (unit ? 1 : 0);
  const clearFilters = () => { setFilter('all'); setBuilding(''); setUnit(''); setSearch(''); };

  const askDelete = async (face) => {
    setDeleteError('');
    setPendingDelete({ face, preview: null, loading: true });
    try {
      const response = await apiFetch(`/faces/${encodeURIComponent(face.id)}/removal-preview`);
      const preview = response.ok ? await response.json() : null;
      setPendingDelete({ face, preview, loading: false });
    } catch {
      setPendingDelete({ face, preview: null, loading: false });
    }
  };

  const confirmDelete = async () => {
    const face = pendingDelete?.face;
    if (!face) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await apiFetch(`/faces/${encodeURIComponent(face.id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Delete failed.');
      setPendingDelete(null);
      await load();
    } catch (error) {
      setDeleteError(error.message);
    } finally { setDeleting(false); }
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1><Users size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.facedb')}</h1>
          <div className="sub">
            {FACES.length} {lang
              ? (FACES.length === 1 ? 'شخص مسجّل' : 'أشخاص مسجّلون')
              : `enrolled ${FACES.length === 1 ? 'person' : 'people'}`}
          </div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search">
          <Search size={14} />
          <input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {/* Built from the tiers actually present. A face record only exists
            for somebody who enrolled, so Strangers and Watchlist were
            filters that could never match anything -- they are offered only
            if such a record ever appears. */}
        {tierChips.length > 1 && (
          <div className="chips">
            {tierChips.map(([key, label, count]) => (
              <span key={key} className={`chip ${filter === key ? 'on' : ''}`} onClick={() => setFilter(key)}>
                {label}{count === null ? '' : ` ${count}`}
              </span>
            ))}
          </div>
        )}

        <select value={building} onChange={e => { setBuilding(e.target.value); setUnit(''); }}>
          <option value="">{lang ? 'كل المباني' : 'All buildings'}</option>
          {buildings.map(code => <option key={code} value={code}>{code}</option>)}
        </select>

        <select value={unit} onChange={e => setUnit(e.target.value)} disabled={!units.length}>
          <option value="">{lang ? 'كل الوحدات' : 'All units'}</option>
          {units.map(code => <option key={code} value={code}>{code}</option>)}
        </select>

        {activeFilters > 0 && (
          <button className="btn ghost sm" onClick={clearFilters}>
            <X size={13} /> {lang ? 'مسح' : 'Clear'}
          </button>
        )}

        <div className="grow" />
        <span className="sub" style={{ fontSize: 12 }}>
          {filtered.length === FACES.length
            ? `${FACES.length} ${lang ? 'شخص' : 'people'}`
            : `${filtered.length} ${lang ? 'من' : 'of'} ${FACES.length}`}
        </span>
        <button className="btn ghost sm" disabled={!filtered.length} onClick={() => exportCsv(filtered, lang)}>
          <Upload size={14} /> {lang ? 'تصدير CSV' : 'Export CSV'}
        </button>
      </div>

      <div className="panel glass-panel" style={{ padding: 0, overflowX: 'auto', border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Face ID</th>
              <th>{lang ? 'الاسم' : 'Name'}</th>
              <th>Tier</th>
              <th>{lang ? 'المبنى / الوحدة' : 'Building / Unit'}</th>
              <th>ID/Card</th>
              <th>{lang ? 'الاكتشافات' : 'Detections'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id} onClick={() => openFace(f.id)} style={{ transition: '0.2s', cursor: 'pointer', opacity: loadingId === f.id ? 0.5 : 1 }}>
                <td>
                  <span className="face-th" style={{ borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, overflow: 'hidden' }}>
                    {f.img ? <img src={f.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                     f.type === 'watch' ? <ShieldAlert size={18} color="var(--red)" /> :
                     f.type === 'unknown' ? <UserX size={18} color="var(--amber)" /> :
                     <User size={18} color="var(--green)" />}
                  </span>
                </td>
                <td className="mono" style={{ color: '#fff' }}>{f.id}</td>
                <td>
                  <b>{displayName(f, lang, f.id)}</b>
                  {f.inGallery === false && <span className="tag watch" style={{ marginLeft: 6, fontSize: 10 }} title={lang ? 'غير موجود في معرض الذكاء الاصطناعي؛ لن تتعرف عليه الكاميرات' : 'Not in the AI gallery: cameras will not recognise this person'}>{lang ? 'خارج المعرض' : 'Not in AI'}</span>}
                  <br />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{displayName({ name: f.role }, lang, '')}</span>
                </td>
                <td><span className={`tag ${f.type}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{t(`face.${f.type}`)}</span></td>
                <td>{f.bldg || '—'} <span style={{ opacity: 0.5 }}>·</span> <span className="mono">{f.unit || '—'}</span></td>
                <td className="mono" style={{ color: 'var(--muted)' }}>{f.idno || '—'}</td>
                <td><span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>{f.detections ?? 0}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {/* Track reads ?face=; without it the page falls back to
                        whoever was seen most recently, not this row. */}
                    <button className="btn ghost sm"
                      onClick={() => navigate(`/track?face=${encodeURIComponent(f.id)}`)}>Track</button>
                    {canEdit('facedb') ? (
                      <button className="btn ghost sm" title={lang ? 'حذف' : 'Delete'}
                        aria-label={lang ? 'حذف' : 'Delete'}
                        onClick={() => askDelete(f)}>
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={8} className="sub" style={{ padding: 16 }}>
                {error ? (lang ? 'تعذر تحميل قاعدة الوجوه: ' : 'Could not load the Face Database: ') + error
                  : FACES.length ? (lang ? 'لا نتائج مطابقة.' : 'No matching faces.')
                  : (lang ? 'لا يوجد أشخاص مسجلون بعد. يظهر المالك هنا بعد اعتماد طلب تسجيله.' : 'No one enrolled yet. Owners appear here once their enrollment is approved.')}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && <FaceDetails face={selected} lang={lang} t={t} onClose={() => setSelected(null)} />}
      {pendingDelete ? (
        <div className="sv-backdrop" onClick={() => !deleting && setPendingDelete(null)} role="presentation">
          <div className="sv" style={{ width: 'min(520px, 100%)' }} onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true">
            <header className="sv-head">
              <div><b>{lang ? 'حذف شخص' : 'Remove person'}</b></div>
              <button className="sv-close" onClick={() => setPendingDelete(null)} disabled={deleting}>
                <X size={18} />
              </button>
            </header>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                {lang ? 'سيتم حذف' : 'This will permanently remove'}{' '}
                <b>{displayName(pendingDelete.face, lang, pendingDelete.face.id)}</b>{' '}
                {lang ? 'نهائياً من قاعدة البيانات ومن معرّف الكاميرات.' : 'from the database and from the camera recognition gallery.'}
              </div>

              {pendingDelete.loading ? (
                <div className="sub">{lang ? 'جاري التحقق…' : 'Checking what else is affected…'}</div>
              ) : pendingDelete.preview?.household?.length ? (
                <div className="note" style={{ borderColor: 'var(--amber, #e0a458)', color: 'var(--txt)' }}>
                  <b>{lang
                    ? `سيتم حذف ${pendingDelete.preview.household.length} من أفراد الأسرة أيضاً:`
                    : `${pendingDelete.preview.household.length} household member(s) will also be removed:`}</b>
                  <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                    {pendingDelete.preview.household.map((m, i) => (
                      <li key={i} style={{ fontSize: 12 }}>{m.name}{m.relation ? ` — ${m.relation}` : ''}</li>
                    ))}
                  </ul>
                </div>
              ) : pendingDelete.preview?.relationship === 'member' ? (
                <div className="sub" style={{ fontSize: 12 }}>
                  {lang
                    ? 'هذا الشخص فرد من أسرة؛ سيُحذف وحده ويبقى صاحب التسجيل.'
                    : 'This person is a household member: only they are removed, the resident who registered them stays.'}
                </div>
              ) : null}

              {deleteError ? <div className="err">{deleteError}</div> : null}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn ghost" disabled={deleting} onClick={() => setPendingDelete(null)}>
                  {lang ? 'إلغاء' : 'Cancel'}
                </button>
                <button className="btn red" disabled={deleting || pendingDelete.loading} onClick={confirmDelete}>
                  <Trash2 size={14} /> {deleting ? (lang ? 'جاري الحذف…' : 'Removing…') : (lang ? 'حذف نهائي' : 'Remove permanently')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const box = { background: 'var(--stat-bg)', padding: 12, borderRadius: 12, border: '1px solid var(--glass-border)' };

function Field({ label, children, mono }) {
  return (
    <div className="fg">
      <label>{label}</label>
      <div className={mono ? 'mono' : undefined} style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{children || '—'}</div>
    </div>
  );
}

/** Everything known about one person: face record, the enrollment they came from, and sightings. */
function FaceDetails({ face, lang, t, onClose }) {
  const [licence, setLicence] = useState(null);   // vehicle whose licence is shown full size
  const e = face.enrollment;
  const owner = e?.owner;
  const member = face.member;              // set when this face is a household member, not the owner
  const isOwner = Boolean(e) && !member;
  const photos = isOwner && Object.keys(owner?.faces || {}).length ? Object.entries(owner.faces)
    : Object.keys(member?.faces || {}).length ? Object.entries(member.faces)
    : face.galleryPhotos?.length ? face.galleryPhotos
    : face.img ? [['front', face.img]] : [];

  return (
    <div className="overlay" onClick={ev => ev.target === ev.currentTarget && onClose()}>
      <div className="modal">
        <div className="mh">
          <span className="sefbadge">{face.id}</span>
          <h3>{displayName(face, lang, face.id)}</h3>
          <span className="x" onClick={onClose}>×</span>
        </div>
        <div className="mb">
          <div className="frow">
            <Field label={lang ? 'الفئة' : 'Tier'}><span className={`tag ${face.type}`}>{t(`face.${face.type}`)}</span></Field>
            <Field label={lang ? 'الصفة' : 'Role'}>{displayName({ name: face.role }, lang, '')}</Field>
            <Field label={lang ? 'المبنى / الوحدة' : 'Building / Unit'}>{face.bldg ? `${face.bldg} · ${face.unit || '—'}` : ''}</Field>
            <Field label={lang ? 'تاريخ التسجيل' : 'Enrolled'} mono>{face.enroll}</Field>
            <Field label={lang ? 'الرقم القومي' : 'National ID'} mono>{face.idno}</Field>
            <Field label={lang ? 'الجوال' : 'Mobile'} mono>{isOwner ? owner?.mobile : member?.mobile}</Field>
            {member && <Field label={lang ? 'صلة القرابة' : 'Relation'}>{member.relation}</Field>}
            {member && <Field label={lang ? 'مالك الوحدة' : 'Unit owner'}>{owner?.name}</Field>}
            <Field label={lang ? 'معرّف AI' : 'AI person ID'} mono>{face.aiPersonId}</Field>
            <Field label={lang ? 'المصدر' : 'Source'}>{e ? 'STMC enrollment' : face.issuer === 'AI gallery' ? (lang ? 'معرض الذكاء الاصطناعي مباشرة' : 'Enrolled directly in the AI gallery') : face.issuer}</Field>
            {face.ban && <Field label="Ban" mono>{face.ban}</Field>}
          </div>

          <div className="fg">
            <label>{lang ? 'صور الوجه' : 'Face photos'}</label>
            {photos.length ? (
              <div className="uploadrow" style={{ ...box, display: 'inline-flex', gap: 8 }}>
                {photos.map(([k, src]) => (
                  <div key={k} className="face-th" title={k} style={{ width: 56, height: 72, borderRadius: 10 }}><img src={src} alt={k} /></div>
                ))}
              </div>
            ) : <div className="hint">{lang ? 'لا توجد صور' : 'No photos stored'}</div>}
          </div>

          {isOwner && e?.residentType === 'tenant' && owner?.rentalAgreement?.length > 0 && (
            <div className="fg">
              <label>{lang ? 'عقد الإيجار' : 'Rental agreement'}</label>
              <div style={{ ...box, display: 'inline-block' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {owner.rentalAgreement.map((page, i) => (
                    <a key={i} href={page} target="_blank" rel="noreferrer"><img src={page} alt={`Rental agreement page ${i + 1}`} style={{ width: 120, height: 160, objectFit: 'cover', borderRadius: 8 }} /></a>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isOwner && owner?.nationalIdCard && (
            <div className="fg">
              <label>{lang ? 'صورة بطاقة الهوية' : 'National ID card'}</label>
              <div style={{ ...box, display: 'inline-block' }}>
                <img src={owner.nationalIdCard} alt="National ID card" style={{ width: '100%', maxWidth: 360, maxHeight: 220, objectFit: 'contain', borderRadius: 10 }} />
              </div>
            </div>
          )}

          {e ? (
            <div className="fg">
              <label>{lang ? 'طلب التسجيل' : 'Enrollment'}</label>
              <div style={{ ...box, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                <span className="mono" style={{ color: '#fff' }}>{e.ref}</span>
                <span>{e.status}</span>
                <span className="mono" style={{ color: 'var(--muted)' }}>{(e.submittedAt || '').slice(0, 16).replace('T', ' ')}</span>
                <span style={{ color: 'var(--muted)' }}>AI: {e.aiSyncStatus}</span>
              </div>
              {e.validationNote && <div className="hint" style={{ marginTop: 6 }}>{e.validationNote}</div>}
            </div>
          ) : <div className="hint">{lang ? 'لا يوجد طلب تسجيل مرتبط بهذا الوجه.' : 'No enrollment is linked to this face.'}</div>}

          {isOwner && (
            <>
              <div className="fg">
                <label><Users size={14} color="var(--accent)" /> {lang ? 'أفراد الأسرة' : 'Household'} ({e.family.length})</label>
                {e.family.length ? e.family.map((m, i) => (
                  <div key={i} style={{ ...box, padding: '8px 12px', marginBottom: 6 }}>
                    <b style={{ color: '#fff' }}>{m.name}</b> <span style={{ opacity: 0.5 }}>·</span> <span className="mono" style={{ color: 'var(--muted)' }}>{m.relation}{m.nid ? ` · ${m.nid}` : ''}</span>
                  </div>
                )) : <div className="hint">{lang ? 'لا يوجد' : 'None'}</div>}
              </div>
              <div className="fg">
                <label><Car size={14} color="var(--accent)" /> {lang ? 'المركبات' : 'Vehicles'} ({e.cars.length})</label>
                {e.cars.length ? e.cars.map((c, i) => (
                  <div key={i} className="mono" style={{ ...box, padding: '8px 12px', marginBottom: 6, marginRight: 8, display: 'inline-block' }}>
                    <b style={{ color: '#fff' }}>{c.plate}</b> <span style={{ opacity: 0.5 }}>·</span> <span style={{ color: 'var(--muted)' }}>{c.color}{c.make ? ' · ' + c.make : ''}</span>
                    {c.licence ? (
                      <img src={c.licence} alt={`Licence for ${c.plate}`} onClick={() => setLicence(c)}
                        style={{ display: 'block', marginTop: 6, width: 150, height: 94, objectFit: 'cover',
                                 borderRadius: 6, border: '1px solid var(--glass-border)', cursor: 'zoom-in' }} />
                    ) : <div className="hint" style={{ marginTop: 6 }}>{lang ? 'بدون رخصة' : 'No licence on file'}</div>}
                  </div>
                )) : <div className="hint">{lang ? 'لا يوجد' : 'None'}</div>}
              </div>
            </>
          )}

          <div className="fg">
            <label>{lang ? 'آخر الاكتشافات' : 'Recent detections'} ({face.detections})</label>
            {face.recentDetections?.length ? (
              <table>
                <thead><tr><th>{lang ? 'الوقت' : 'When'}</th><th>{lang ? 'الكاميرا' : 'Camera'}</th><th>{lang ? 'المبنى' : 'Building'}</th><th>{lang ? 'الثقة' : 'Conf.'}</th></tr></thead>
                <tbody>
                  {face.recentDetections.map(d => (
                    <tr key={d.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{(d.when || '').slice(0, 19).replace('T', ' ')}</td>
                      <td>{d.cameraName || d.cam}</td>
                      <td className="mono">{d.building || '—'}</td>
                      <td>{d.conf}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="hint">{lang ? 'لم يُكتشف بعد' : 'Not seen by any camera yet'}</div>}
          </div>
        </div>
        <div className="mf"><button className="btn ghost" onClick={onClose}>{lang ? 'إغلاق' : 'Close'}</button></div>
      </div>
      {licence ? (
        <div className="sv-backdrop" role="presentation" onClick={(event) => { event.stopPropagation(); setLicence(null); }}
          style={{ zIndex: 60 }}>
          <img src={licence.licence} alt={`Licence for ${licence.plate}`}
            style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} />
        </div>
      ) : null}
    </div>
  );
}

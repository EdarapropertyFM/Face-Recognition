import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Download, Users, ShieldAlert, UserX, User, Car } from 'lucide-react';
import { apiFetch } from '../api';
import { displayName, zoneLabel } from '../utils/display';

export default function FaceDBPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [FACES, setFaces] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);   // full record from GET /faces/:id
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    apiFetch('/faces')
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then(data => { setFaces(data); setError(''); })
      .catch(err => setError(err.message));
  }, []);

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

  const filtered = FACES.filter(f => {
    const bucket = (f.type === 'known' || f.type === 'staff') ? 'owner' : f.type === 'unknown' ? 'stranger' : 'watch';
    const matches = filter === 'all' || filter === bucket || filter === f.type;

    const nameStr = Array.isArray(f.name) ? f.name.join(' ') : (f.name || '');
    const roleStr = Array.isArray(f.role) ? f.role.join(' ') : (f.role || '');

    const q = (f.id + nameStr + (f.idno || '') + roleStr + (f.bldg || '') + (f.unit || '')).toLowerCase();
    return matches && q.includes(search.toLowerCase());
  });

  return (
    <>
      <div className="ph">
        <div>
          <h1><Users size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.facedb')}</h1>
          <div className="sub">{FACES.length} {lang ? 'وجوه · المالك مقابل الغريب' : 'faces · Owner vs Stranger'}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search">
          <Search size={14} />
          <input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">{lang ? 'الكل' : 'All'}</option>
          <option value="owner">👤 {lang ? 'الملاك' : 'Owners'}</option>
          <option value="staff">{lang ? 'الموظفون' : 'Staff'}</option>
          <option value="stranger">❓ {lang ? 'الغرباء' : 'Strangers'}</option>
        </select>
        <div className="grow" />
        <button className="btn"><UserPlus size={14} /> {lang ? 'تسجيل وجه' : 'Enroll Face'}</button>
        <button className="btn ghost sm"><Download size={14} /> Export CSV</button>
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
                    <button className="btn ghost sm" onClick={() => navigate('/track')}>Track</button>
                    {f.type === 'unknown' && <button className="btn sm">Identify</button>}
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
                  </div>
                )) : <div className="hint">{lang ? 'لا يوجد' : 'None'}</div>}
              </div>
            </>
          )}

          <div className="fg">
            <label>{lang ? 'آخر الاكتشافات' : 'Recent detections'} ({face.detections})</label>
            {face.recentDetections?.length ? (
              <table>
                <thead><tr><th>{lang ? 'الوقت' : 'When'}</th><th>{lang ? 'الكاميرا' : 'Camera'}</th><th>{lang ? 'المنطقة' : 'Zone'}</th><th>{lang ? 'الثقة' : 'Conf.'}</th></tr></thead>
                <tbody>
                  {face.recentDetections.map(d => (
                    <tr key={d.id}>
                      <td className="mono" style={{ fontSize: 11 }}>{(d.when || '').slice(0, 19).replace('T', ' ')}</td>
                      <td className="mono">{d.cam}</td>
                      <td>{zoneLabel(d.zone, lang)}</td>
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
    </div>
  );
}

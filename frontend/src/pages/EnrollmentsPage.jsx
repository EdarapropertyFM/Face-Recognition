import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Car, CheckCircle, FileCheck, Info, LoaderCircle, Search, Upload, Users, XCircle } from 'lucide-react';
import { PENDING_ENROLLMENTS } from '../store';
import { useAuth } from '../context/useAuth';
import { apiFetch } from '../api';
import UnitCoverage from '../components/UnitCoverage';

const STATUS_COLORS = {
  pending: 'open', processing: 'actioned', approved: 'closed', rejected: 'watch',
  failed: 'watch', deleting: 'actioned', delete_failed: 'watch',
};

const CSV_COLUMNS = [
  ['Ref', r => r.ref],
  ['Status', r => r.status || 'pending'],
  ['Resident type', r => r.residentType || 'owner'],
  ['Owner', r => r.owner?.name ?? ''],
  ['National ID', r => r.owner?.nid ?? ''],
  ['Mobile', r => r.owner?.mobile ?? ''],
  ['Building', r => r.building ?? ''],
  ['Unit', r => r.unit ?? ''],
  ['People', r => 1 + (r.family?.length || 0)],
  ['Vehicles', r => r.cars?.length || 0],
  ['Submitted', r => (r.submittedAt || '').slice(0, 16).replace('T', ' ')],
  ['AI sync', r => r.aiSyncStatus || 'not_started'],
  ['Decision note', r => r.validationNote ?? ''],
];

/**
 * Exports exactly what the status filter is showing, so "Approved" exports the
 * approved registrations and "All" exports every one. A leading apostrophe
 * would be dropped by spreadsheets, so values are quoted and quotes doubled.
 */
function exportCsv(rows, scope) {
  const csv = [CSV_COLUMNS.map(([heading]) => heading)]
    .concat(rows.map(row => CSV_COLUMNS.map(([, read]) => read(row))))
    .map(cells => cells.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
  // The BOM makes Excel read the Arabic names as UTF-8 rather than mojibake.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `enrollments-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function EnrollmentsPage() {
  const { t, i18n } = useTranslation();
  const { canEdit } = useAuth();
  const lang = i18n.language === 'ar' ? 1 : 0;
  const [records, setRecords] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);
  const [licence, setLicence] = useState(null);   // vehicle whose licence is shown full size
  const [tab, setTab] = useState('requests');   // 'requests' | 'coverage'
  const [rejecting, setRejecting] = useState(null);  // ref awaiting a rejection reason
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  const loadRecords = () => apiFetch('/enrollments')
    .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load enrollments')))
    .then(setRecords)
    .catch(() => setRecords(PENDING_ENROLLMENTS));

  useEffect(() => { loadRecords(); }, []);

  const filtered = records.filter(r =>
    (statusFilter === 'all' || (r.status || 'pending') === statusFilter) &&
    ((r.owner?.name || '') + r.building + r.unit + r.ref).toLowerCase().includes(search.toLowerCase())
  );
  const pendingCount = records.filter(r => (r.status || 'pending') === 'pending').length;

  const approve = async (ref) => {
    const res = await apiFetch(`/enrollments/${ref}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }),
    });
    if (res.ok) { await loadRecords(); setViewing(null); }
    else {
      const body = await res.json().catch(() => ({}));
      alert(body.message || (lang ? 'تعذر اعتماد الطلب. تأكد من خدمة الذكاء الاصطناعي وصور الوجه.' : 'Could not approve this request. Check the AI service and face photos.'));
      await loadRecords();
    }
  };
  // A rejection carries its reason: the applicant is told what to fix, and
  // the record keeps an account of why it was refused.
  const closeReject = () => {
    setRejecting(null); setRejectReason(''); setRejectError('');
  };

  const confirmReject = async () => {
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      setRejectError(lang ? 'اكتب سبب الرفض.' : 'Write why this registration is being rejected.');
      return;
    }
    setRejectBusy(true);
    const res = await apiFetch(`/enrollments/${rejecting}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', validationNote: reason }),
    });
    setRejectBusy(false);
    if (res.ok) {
      await loadRecords();
      closeReject();
      setViewing(null);
    } else {
      const body = await res.json().catch(() => ({}));
      setRejectError([body.message].flat().filter(Boolean).join(' ')
        || (lang ? 'تعذر رفض الطلب.' : 'Could not reject this request.'));
    }
  };
  const rec = viewing ? records.find(r => r.ref === viewing) : null;
  // Whose registration is being refused. The validate modal is hidden while
  // this prompt is open -- leaving it mounted stacked two backdrops and left
  // a scrollable modal moving behind the dialog.
  const rejectingRec = rejecting ? records.find(r => r.ref === rejecting) : null;

  return (
    <>
      <div className="ph">
        <div>
          <h1><FileCheck size={24} style={{ verticalAlign: 'middle', color: 'var(--accent)', marginRight: 8, marginBottom: 4 }} />{t('nav.enrollments')}</h1>
          <div className="sub">{lang ? 'STMC · طلبات التسجيل والمراجعة والتفعيل' : 'STMC · registrations → validate → activate'}</div>
        </div>
      </div>

      <div className="panel glass-panel" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <Info size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          {lang
            ? <>الدورة: يقدّم المالك الطلب عبر STMC → يصل هنا كـ <b>قيد المراجعة</b> → يراجع الأمن الهوية والصور الخمس → <b>اعتماد</b> يفعّل وجه المالك في قاعدة الوجوه.</>
            : <>Cycle: owner submits through STMC secure enrollment → arrives here as <b>Pending</b> → security validates the identity and the three face captures → <b>Approve</b> activates the owner in the Face Database, or <b>Reject</b>.</>}
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 16 }}>
        <span className={`chip ${tab === 'requests' ? 'on' : ''}`} onClick={() => setTab('requests')}>{lang ? 'طلبات التسجيل' : 'Registration requests'}</span>
        <span className={`chip ${tab === 'coverage' ? 'on' : ''}`} onClick={() => setTab('coverage')}>{lang ? 'التغطية حسب المبنى' : 'Coverage by building'}</span>
      </div>

      {tab === 'coverage' ? <UnitCoverage embedded /> : <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search"><Search size={14} /><input type="text" placeholder={lang ? 'بحث…' : 'Search…'} value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="chips">
          {['pending','approved','rejected','all'].map(s => (
            <span key={s} className={`chip ${statusFilter === s ? 'on' : ''}`} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? (lang ? 'الكل' : 'All') : s === 'pending' ? (lang ? 'قيد المراجعة' : 'Pending') : s === 'approved' ? (lang ? 'معتمد' : 'Approved') : (lang ? 'مرفوض' : 'Rejected')}
              {s === 'pending' && pendingCount > 0 && <b style={{ marginLeft: 5, background: 'var(--red)', color:'#fff', borderRadius: 99, padding: '0 5px', fontSize: 11 }}>{pendingCount}</b>}
            </span>
          ))}
        </div>
        <div className="grow" />
        <button className="btn ghost sm" disabled={!filtered.length}
          title={lang ? 'تصدير ما يعرضه الفلتر الحالي' : 'Exports whatever the current filter shows'}
          onClick={() => exportCsv(filtered, statusFilter)}>
          <Upload size={14} /> {lang ? 'تصدير' : 'Export'} ({filtered.length})
        </button>
      </div>

      <div className="panel glass-panel" style={{ padding: 0, overflowX: 'auto', border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>{lang ? 'المالك' : 'Owner'}</th>
              <th>{lang ? 'المبنى / الوحدة' : 'Building / Unit'}</th>
              <th><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} color="var(--muted)" /> {lang ? 'الأشخاص' : 'People'}</div></th>
              <th><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Car size={14} color="var(--muted)" /> {lang ? 'المركبات' : 'Vehicles'}</div></th>
              <th>{lang ? 'وقت التقديم' : 'Submitted'}</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map(r => (
              <tr key={r.ref} onClick={() => setViewing(r.ref)} style={{ cursor: 'pointer' }}>
                <td className="mono" style={{ color: '#fff' }}>{r.ref}</td>
                <td><b>{r.owner?.name || '—'}</b> {r.residentType === 'tenant' ? <span className="tag actioned" style={{ marginLeft: 6, fontSize: 10 }}>{lang ? 'مستأجر' : 'Tenant'}</span> : <span className="tag known" style={{ marginLeft: 6, fontSize: 10 }}>{lang ? 'مالك' : 'Owner'}</span>}</td>
                <td>{r.building} <span style={{ opacity: 0.5 }}>·</span> <span className="mono">{r.unit}</span></td>
                <td><span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>{1 + (r.family?.length || 0)}</span></td>
                <td><span style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>{r.cars?.length || 0}</span></td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{(r.submittedAt || '').slice(0, 16).replace('T', ' ')}</td>
                <td><span className={`tag ${STATUS_COLORS[r.status || 'pending']}`} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{r.status || 'pending'}</span></td>
                <td><button className="btn ghost sm" style={{ padding: '4px 12px' }} onClick={(e) => { e.stopPropagation(); setViewing(r.ref); }}>{lang ? 'تحقّق' : 'Validate'}</button></td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="sub" style={{ padding: 16 }}>No records.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      </>}

      {/* Modal */}
      {rec && !rejecting && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setViewing(null)}>
          <div className="modal">
            <div className="mh">
              <span className="sefbadge">{rec.ref}</span>
              <h3>{lang ? 'تحقّق' : 'Validate'} — {rec.owner?.name || ''}</h3>
              <span className="x" onClick={() => setViewing(null)}>×</span>
            </div>
            <div className="mb">
              <div className="frow">
                <div className="fg"><label>{lang ? 'نوع الساكن' : 'Resident type'}</label><div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{rec.residentType === 'tenant' ? (lang ? 'مستأجر' : 'Tenant') : (lang ? 'مالك' : 'Owner')}</div></div>
                <div className="fg"><label>Building / Unit</label><div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{rec.building} <span style={{ opacity: 0.5 }}>·</span> <span className="mono">{rec.unit}</span></div></div>
                <div className="fg"><label>Status</label><div style={{ marginTop: 4 }}><span className={`tag ${STATUS_COLORS[rec.status || 'pending']}`} style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{rec.status || 'pending'}</span></div></div>
                <div className="fg"><label>AI sync</label><div className="mono" style={{ color: 'var(--muted)', fontSize: 13, background: 'var(--stat-bg)', padding: '6px 12px', borderRadius: 8, display: 'inline-block' }}>{rec.aiSyncStatus || 'not_started'}</div></div>
                <div className="fg"><label>Sync attempts</label><div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{rec.syncAttempts || 0}</div></div>
                <div className="fg"><label>National ID</label><div className="mono" style={{ color: 'var(--muted)' }}>{rec.owner?.nid || '—'}</div></div>
                <div className="fg"><label>Mobile</label><div className="mono" style={{ color: 'var(--muted)' }}>{rec.owner?.mobile || '—'}</div></div>
              </div>

              <div className="fg">
                <label>{lang ? 'صور وجه المالك' : 'Owner face — validated captures (front, left, right)'}</label>
                <div className="uploadrow" style={{ background: 'var(--stat-bg)', padding: '12px', borderRadius: 12, border: '1px solid var(--glass-border)', display: 'inline-flex' }}>
                  {['front','left','right','stepBack','betterLighting'].filter(k => rec.owner?.faces?.[k] || ['front','left','right'].includes(k)).map(k => (
                    <div key={k} className="face-th" style={{ width: 56, height: 72, borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                      {rec.owner?.faces?.[k] ? <img src={rec.owner.faces[k]} alt={k} /> : '🙂'}
                    </div>
                  ))}
                </div>
              </div>

              <div className="fg">
                <label>{lang ? 'صورة بطاقة الهوية' : 'National ID card'}</label>
                <div style={{ background: 'var(--stat-bg)', padding: '12px', borderRadius: 12, border: '1px solid var(--glass-border)', display: 'inline-block' }}>
                  {rec.owner?.nationalIdCard
                    ? <img src={rec.owner.nationalIdCard} alt="National ID card" style={{ width: '100%', maxWidth: 360, maxHeight: 220, objectFit: 'contain', borderRadius: 10 }} />
                    : <div className="hint" style={{ padding: '20px 40px' }}>Not provided</div>}
                </div>
              </div>

              {rec.residentType === 'tenant' && (
                <div className="fg">
                  <label>{lang ? 'عقد الإيجار' : 'Rental agreement'}</label>
                  <div style={{ background: 'var(--stat-bg)', padding: '12px', borderRadius: 12, border: '1px solid var(--glass-border)', display: 'inline-block' }}>
                    {[rec.owner?.rentalAgreement ?? []].flat().filter(Boolean).length
                      ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          {[rec.owner.rentalAgreement].flat().filter(Boolean).map((page, i) => (
                            <a key={i} href={page} target="_blank" rel="noreferrer" title={`${lang ? 'صفحة' : 'Page'} ${i + 1}`}>
                              <img src={page} alt={`Rental agreement page ${i + 1}`} style={{ width: 150, height: 200, objectFit: 'cover', borderRadius: 8 }} />
                            </a>
                          ))}
                        </div>
                      : <div className="hint" style={{ padding: '20px 40px', color: 'var(--red)' }}>{lang ? 'لم يُرفق' : 'Not provided'}</div>}
                  </div>
                </div>
              )}

              <div className="fg">
                <label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><Users size={14} color="var(--accent)" /> {lang ? 'أفراد الأسرة' : 'Household'} ({rec.family?.length || 0})</div></label>
                {rec.family?.length ? rec.family.map((m, mi) => (
                  <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--stat-bg)', padding: '8px 12px', borderRadius: 10, marginBottom: 8, border: '1px solid var(--glass-border)' }}>
                    <div className="face-th" style={{ width: 40, height: 40, borderRadius: 8 }}>{m.faces?.front ? <img src={m.faces.front} alt="" /> : <Users size={18} />}</div>
                    <div><b style={{ color: '#fff' }}>{m.name}</b> <span style={{ opacity: 0.5, margin: '0 4px' }}>·</span> <span className="mono" style={{ color: 'var(--muted)' }}>{m.relation}</span></div>
                  </div>
                )) : <div className="hint">None</div>}
              </div>

              <div className="fg">
                <label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><Car size={14} color="var(--accent)" /> {lang ? 'المركبات' : 'Vehicles'} ({rec.cars?.length || 0})</div></label>
                {rec.cars?.length ? rec.cars.map((c, ci) => (
                  <div key={ci} className="mono" style={{ background: 'var(--stat-bg)', padding: '8px 12px', borderRadius: 8, marginBottom: 6, display: 'inline-block', marginRight: 8, border: '1px solid var(--glass-border)' }}>
                    <b style={{ color: '#fff', fontSize: 13 }}>{c.plate}</b> <span style={{ opacity: 0.5, margin: '0 4px' }}>·</span> <span style={{ color: 'var(--muted)' }}>{c.color}{c.make ? ' · ' + c.make : ''}</span>
                    {c.licence ? (
                      <img src={c.licence} alt={`Licence for ${c.plate}`} onClick={() => setLicence(c)}
                        style={{ display: 'block', marginTop: 6, width: 150, height: 94, objectFit: 'cover',
                                 borderRadius: 6, border: '1px solid var(--glass-border)', cursor: 'zoom-in' }} />
                    ) : <div className="hint" style={{ marginTop: 6 }}>{lang ? 'بدون رخصة' : 'No licence on file'}</div>}
                  </div>
                )) : <div className="hint">None</div>}
              </div>

              <div className="panel glass-panel" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginTop: 24, background: 'rgba(0,164,196,0.08)', border: '1px solid rgba(0,164,196,0.2)' }}>
                <Info size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--txt)' }}>
                  On Approve: the validated owner becomes active in the Face Database for <b>{rec.building} {rec.unit}</b>. Household members remain application details unless separately enrolled.
                </div>
              </div>
              {/* The note was rendered as a bare paragraph, so a rejection
                  reason appeared as unattributed text with no field name.
                  It is the record of a decision, so it is labelled as one. */}
              {rec.validationNote ? (
                <div className={`decision-note ${rec.status === 'rejected' ? 'rejected' : rec.status === 'failed' ? 'failed' : ''}`}>
                  <div className="decision-note-head">
                    {rec.status === 'rejected'
                      ? <><XCircle size={14} /> {lang ? 'سبب الرفض' : 'Reason for rejection'}</>
                      : rec.status === 'failed'
                        ? <><Info size={14} /> {lang ? 'سبب الفشل' : 'Why it failed'}</>
                        : <><Info size={14} /> {lang ? 'ملاحظة' : 'Note'}</>}
                  </div>
                  <p>{rec.validationNote}</p>
                </div>
              ) : rec.status === 'rejected' ? (
                <div className="decision-note rejected">
                  <div className="decision-note-head">
                    <XCircle size={14} /> {lang ? 'سبب الرفض' : 'Reason for rejection'}
                  </div>
                  <p className="decision-note-missing">
                    {lang
                      ? 'لم يُسجَّل سبب — رُفض قبل أن يصبح السبب إلزامياً.'
                      : 'No reason was recorded — rejected before a reason was required.'}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="mf">
              {['pending', 'failed'].includes(rec.status || 'pending') && canEdit('enrollments') ? (
                <>
                  <button className="btn red" onClick={() => { setRejecting(rec.ref); setRejectReason(''); setRejectError(''); }}><XCircle size={14} /> {lang ? 'رفض' : 'Reject'}</button>
                  <button className="btn" onClick={() => approve(rec.ref)}><CheckCircle size={14} /> {rec.status === 'failed' ? (lang ? 'إعادة المحاولة' : 'Retry approval') : (lang ? 'اعتماد' : 'Approve')}</button>
                </>
              ) : rec.status === 'processing' ? (
                <button className="btn ghost" disabled>{lang ? 'جاري المزامنة مع AI…' : 'AI sync in progress…'}</button>
              ) : (
                <button className="btn ghost" onClick={() => setViewing(null)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}
      {rejecting && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="reject-title"
          onClick={e => e.target === e.currentTarget && closeReject()}>
          <form className="modal reject-modal"
            onSubmit={e => { e.preventDefault(); confirmReject(); }}
            onKeyDown={e => { if (e.key === 'Escape') closeReject(); }}>
            <div className="mh">
              <span className="sefbadge">{rejecting}</span>
              <h3 id="reject-title">{lang ? 'سبب الرفض' : 'Reason for rejection'}</h3>
              <span className="x" onClick={closeReject}>&times;</span>
            </div>

            <div className="mb">
              {/* The big modal is hidden behind this, so say who is being
                  refused rather than leaving only a reference number. */}
              {rejectingRec && (
                <div className="reject-subject">
                  <XCircle size={16} />
                  <span>
                    {lang ? 'رفض تسجيل ' : 'Rejecting the registration of '}
                    <b>{rejectingRec.owner?.name || (lang ? 'غير معروف' : 'unknown')}</b>
                    {' — '}{rejectingRec.building} · <span className="mono">{rejectingRec.unit}</span>
                  </span>
                </div>
              )}

              <div className="fg">
                <label htmlFor="reject-reason">{lang ? 'السبب' : 'Reason'}</label>
                <textarea
                  id="reject-reason" autoFocus rows={4} maxLength={500} value={rejectReason}
                  className={rejectError ? 'has-error' : ''}
                  onChange={e => { setRejectReason(e.target.value); if (rejectError) setRejectError(''); }}
                  placeholder={lang
                    ? 'مثال: صورة بطاقة الهوية غير واضحة.'
                    : 'For example: the National ID photo is unreadable.'} />
                <div className="reject-meta">
                  <span className="hint" style={{ margin: 0 }}>
                    {lang
                      ? 'يُحفظ مع الطلب ويُعرض لمقدّمه.'
                      : 'Saved with the registration and shown to the applicant.'}
                  </span>
                  <span className="mono">{rejectReason.trim().length}/500</span>
                </div>
                {rejectError ? <p className="reject-error">{rejectError}</p> : null}
              </div>
            </div>

            <div className="mf">
              <button type="button" className="btn ghost" onClick={closeReject}>
                {lang ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" className="btn red" disabled={rejectReason.trim().length < 3 || rejectBusy}>
                {rejectBusy ? <LoaderCircle size={14} /> : <XCircle size={14} />}{' '}
                {lang ? 'تأكيد الرفض' : 'Confirm rejection'}
              </button>
            </div>
          </form>
        </div>
      )}

      {licence ? (
        <div className="sv-backdrop" role="presentation" onClick={(event) => { event.stopPropagation(); setLicence(null); }}
          style={{ zIndex: 60 }}>
          <img src={licence.licence} alt={`Licence for ${licence.plate}`}
            style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} />
        </div>
      ) : null}
    </>
  );
}

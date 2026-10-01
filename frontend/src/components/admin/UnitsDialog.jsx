import { useMemo, useState } from 'react';
import {
  Check, DoorOpen, LoaderCircle, Plus, Search, Trash2, UserMinus, UserPlus, X,
} from 'lucide-react';

/**
 * The units of one building, and who owns each.
 *
 * Owners are edited one unit at a time against a targeted endpoint rather
 * than by rewriting the whole map, so two admins working on different units
 * cannot overwrite each other. Clearing an owner is the "they moved out"
 * case and is deliberately as easy as setting one.
 */
export default function UnitsDialog({
  lang, project, building, busy, onClose, onBulkAdd, onRemoveUnit, onSetOwner,
}) {
  const [search, setSearch] = useState('');
  const [onlyVacant, setOnlyVacant] = useState(false);
  const [editing, setEditing] = useState(null);     // { unit, value }

  const units = building.units ?? [];
  const owned = units.filter((row) => row.owner).length;

  const shown = useMemo(() => units.filter((row) => {
    if (onlyVacant && row.owner) return false;
    const text = `${row.unit} ${row.owner ?? ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  }), [units, search, onlyVacant]);

  const save = async () => {
    const ok = await onSetOwner(editing.unit, editing.value.trim());
    if (ok) setEditing(null);
  };

  return (
    <div className="overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal units-modal">
        <div className="mh">
          <span className="sefbadge">{project}</span>
          <h3><DoorOpen size={17} style={{ verticalAlign: -3, marginInlineEnd: 6 }} />{building.code}</h3>
          <span className="x" onClick={onClose}>&times;</span>
        </div>

        <div className="mb">
          <div className="units-summary">
            <div><b>{units.length}</b><span>{lang ? 'وحدة' : 'units'}</span></div>
            <div><b style={{ color: 'var(--green)' }}>{owned}</b><span>{lang ? 'لها مالك' : 'with an owner'}</span></div>
            <div><b style={{ color: 'var(--amber)' }}>{units.length - owned}</b><span>{lang ? 'شاغرة' : 'vacant'}</span></div>
            <div><b>{building.people ?? 0}</b><span>{lang ? 'مسجّلون' : 'people enrolled'}</span></div>
          </div>

          <div className="toolbar" style={{ margin: '14px 0 10px' }}>
            <div className="search">
              <Search size={14} />
              <input type="text" value={search} placeholder={lang ? 'بحث بالوحدة أو المالك…' : 'Search unit or owner…'}
                onChange={(event) => setSearch(event.target.value)} />
            </div>
            <span className={`chip ${onlyVacant ? 'on' : ''}`} onClick={() => setOnlyVacant((v) => !v)}>
              {lang ? 'الشاغرة فقط' : 'Vacant only'}
            </span>
            <div className="grow" />
            <button className="btn sm" onClick={onBulkAdd}>
              <Plus size={13} /> {lang ? 'إضافة وحدات' : 'Add units'}
            </button>
          </div>

          {units.length === 0 ? (
            <div className="hint" style={{ padding: '18px 0' }}>
              {lang
                ? 'لا توجد وحدات بعد. أضف دفعة لتظهر في نموذج التسجيل.'
                : 'No units yet. Add a batch so residents can pick one during registration.'}
            </div>
          ) : (
            <div className="units-list">
              {shown.map((row) => (
                <div key={row.unit} className={`units-row ${row.owner ? '' : 'vacant'}`}>
                  <span className="units-code mono">{row.unit}</span>

                  {editing?.unit === row.unit ? (
                    <span className="units-edit">
                      <input type="text" autoFocus value={editing.value}
                        placeholder={lang ? 'اسم المالك' : 'Owner name'}
                        onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') save();
                          if (event.key === 'Escape') setEditing(null);
                        }} />
                      <button className="btn sm" disabled={busy} onClick={save} title={lang ? 'حفظ' : 'Save'}>
                        <Check size={13} />
                      </button>
                      <button className="btn ghost sm" onClick={() => setEditing(null)}><X size={13} /></button>
                    </span>
                  ) : (
                    <>
                      <button className="units-owner" onClick={() => setEditing({ unit: row.unit, value: row.owner ?? '' })}
                        title={lang ? 'تعديل المالك' : 'Set the owner'}>
                        {row.owner
                          ? <>{row.owner}</>
                          : <span className="units-vacant">{lang ? 'شاغرة — اضغط لتعيين مالك' : 'vacant — click to assign'}</span>}
                      </button>

                      {row.enrollments > 0 && (
                        <span className="tag known" title={lang ? 'تسجيلات على هذه الوحدة' : 'registrations on this unit'}>
                          {row.enrollments}
                        </span>
                      )}

                      {row.owner ? (
                        <button className="btn ghost sm" disabled={busy}
                          title={lang ? 'إخلاء الوحدة' : 'Vacate (clear the owner)'}
                          onClick={() => onSetOwner(row.unit, '')}>
                          <UserMinus size={13} />
                        </button>
                      ) : (
                        <button className="btn ghost sm" title={lang ? 'تعيين مالك' : 'Assign an owner'}
                          onClick={() => setEditing({ unit: row.unit, value: '' })}>
                          <UserPlus size={13} />
                        </button>
                      )}

                      <button className="btn ghost sm" disabled={busy}
                        title={lang ? 'حذف الوحدة' : 'Remove this unit'}
                        onClick={() => {
                          if (!window.confirm(lang
                            ? `حذف الوحدة ${row.unit}؟`
                            : `Remove unit ${row.unit} from ${building.code}?`)) return;
                          onRemoveUnit(row.unit);
                        }}>
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              ))}
              {!shown.length && (
                <div className="hint" style={{ padding: '14px 0' }}>
                  {lang ? 'لا نتائج.' : 'No units match.'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mf">
          {busy ? <span className="hint"><LoaderCircle size={13} /> {lang ? 'جاري الحفظ…' : 'Saving…'}</span> : <span />}
          <button className="btn ghost" onClick={onClose}>{lang ? 'إغلاق' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}

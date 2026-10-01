import { useMemo, useState } from 'react';
import { Hash, LayoutGrid, List, LoaderCircle, Plus, TriangleAlert } from 'lucide-react';
import { expandFloors, expandList, expandRange, splitExisting, MAX_GENERATED } from '../../utils/codes';

/**
 * Generates a batch of codes and shows exactly what will be created before
 * it is created.
 *
 * `kind` is 'building' or 'unit': buildings get a prefix/range and a free
 * list; units add a floors x per-floor generator, because that is how
 * almost every tower here numbers its doors.
 */
export default function BulkAddDialog({ kind, lang, existing = [], busy, onCancel, onAdd, title, subtitle }) {
  const isUnit = kind === 'unit';
  const [mode, setMode] = useState(isUnit ? 'floors' : 'range');
  const [range, setRange] = useState({ prefix: isUnit ? '' : 'B', from: 1, to: isUnit ? 20 : 5, width: 2, suffix: '' });
  const [floors, setFloors] = useState({ floors: 5, perFloor: 4, firstFloor: 1, separator: '', width: 2 });
  const [text, setText] = useState('');
  const [unitsPerBuilding, setUnitsPerBuilding] = useState('');

  const generated = useMemo(() => {
    if (mode === 'range') return expandRange(range);
    if (mode === 'floors') return expandFloors(floors);
    return expandList(text);
  }, [mode, range, floors, text]);

  const { fresh, duplicates } = useMemo(
    () => splitExisting(generated, existing), [generated, existing]);

  const MODES = [
    { key: 'range', label: lang ? 'نطاق' : 'Range', icon: <Hash size={13} /> },
    ...(isUnit ? [{ key: 'floors', label: lang ? 'أدوار' : 'Floors', icon: <LayoutGrid size={13} /> }] : []),
    { key: 'list', label: lang ? 'قائمة' : 'Paste list', icon: <List size={13} /> },
  ];

  return (
    <div className="overlay" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="modal bulk-modal">
        <div className="mh">
          <h3>{title}</h3>
          <span className="x" onClick={onCancel}>&times;</span>
        </div>

        <div className="mb">
          {subtitle ? <p className="hint" style={{ marginTop: 0 }}>{subtitle}</p> : null}

          <div className="chips" style={{ marginBottom: 14 }}>
            {MODES.map((option) => (
              <span key={option.key} className={`chip ${mode === option.key ? 'on' : ''}`}
                onClick={() => setMode(option.key)}>
                {option.icon} {option.label}
              </span>
            ))}
          </div>

          {mode === 'range' && (
            <div className="bulk-grid">
              <div className="fg">
                <label>{lang ? 'بادئة' : 'Prefix'}</label>
                <input type="text" value={range.prefix} placeholder={isUnit ? '' : 'B'}
                  onChange={(e) => setRange({ ...range, prefix: e.target.value })} />
              </div>
              <div className="fg">
                <label>{lang ? 'من' : 'From'}</label>
                <input type="number" value={range.from}
                  onChange={(e) => setRange({ ...range, from: e.target.value })} />
              </div>
              <div className="fg">
                <label>{lang ? 'إلى' : 'To'}</label>
                <input type="number" value={range.to}
                  onChange={(e) => setRange({ ...range, to: e.target.value })} />
              </div>
              <div className="fg">
                <label>{lang ? 'أصفار' : 'Pad to'}</label>
                <input type="number" min="0" max="6" value={range.width}
                  onChange={(e) => setRange({ ...range, width: e.target.value })} />
              </div>
              <div className="fg">
                <label>{lang ? 'لاحقة' : 'Suffix'}</label>
                <input type="text" value={range.suffix}
                  onChange={(e) => setRange({ ...range, suffix: e.target.value })} />
              </div>
            </div>
          )}

          {mode === 'floors' && (
            <div className="bulk-grid">
              <div className="fg">
                <label>{lang ? 'عدد الأدوار' : 'Floors'}</label>
                <input type="number" min="1" value={floors.floors}
                  onChange={(e) => setFloors({ ...floors, floors: e.target.value })} />
              </div>
              <div className="fg">
                <label>{lang ? 'وحدات بالدور' : 'Units per floor'}</label>
                <input type="number" min="1" value={floors.perFloor}
                  onChange={(e) => setFloors({ ...floors, perFloor: e.target.value })} />
              </div>
              <div className="fg">
                <label>{lang ? 'أول دور' : 'First floor'}</label>
                <input type="number" value={floors.firstFloor}
                  onChange={(e) => setFloors({ ...floors, firstFloor: e.target.value })} />
              </div>
              <div className="fg">
                <label>{lang ? 'فاصل' : 'Separator'}</label>
                <input type="text" maxLength={2} value={floors.separator} placeholder={lang ? 'بدون' : 'none'}
                  onChange={(e) => setFloors({ ...floors, separator: e.target.value })} />
              </div>
              <div className="fg">
                <label>{lang ? 'أصفار' : 'Pad to'}</label>
                <input type="number" min="0" max="4" value={floors.width}
                  onChange={(e) => setFloors({ ...floors, width: e.target.value })} />
              </div>
            </div>
          )}

          {mode === 'list' && (
            <div className="fg">
              <label>{lang ? 'الأكواد، واحد بكل سطر' : 'Codes, one per line'}</label>
              <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={isUnit ? '101\n102\n201' : 'A\nB\nC'}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'vertical',
                  background: 'var(--bg2)', color: 'var(--txt)', border: '1px solid var(--line)',
                  fontFamily: 'ui-monospace, monospace', fontSize: 12,
                }} />
            </div>
          )}

          {!isUnit && (
            <div className="fg" style={{ marginTop: 12 }}>
              <label>{lang ? 'عدد الوحدات لكل مبنى (اختياري)' : 'Units in each of these buildings (optional)'}</label>
              <input type="number" min="0" value={unitsPerBuilding} style={{ maxWidth: 160 }}
                placeholder={lang ? 'يمكن تحديده لاحقاً' : 'can be set later'}
                onChange={(e) => setUnitsPerBuilding(e.target.value)} />
            </div>
          )}

          <div className="bulk-preview">
            <div className="bulk-preview-head">
              <b>{lang ? 'سيتم الإنشاء' : 'Will create'}</b>
              <span className={fresh.length ? 'tag closed' : 'tag watch'}>{fresh.length}</span>
              {duplicates.length > 0 && (
                <span className="bulk-dupe">
                  <TriangleAlert size={12} /> {duplicates.length} {lang ? 'موجود بالفعل — سيُتخطى' : 'already exist — will be skipped'}
                </span>
              )}
            </div>
            <div className="bulk-preview-codes">
              {fresh.length
                ? <>
                    {fresh.slice(0, 60).map((code) => <span key={code} className="bulk-code">{code}</span>)}
                    {fresh.length > 60 && <span className="bulk-more">+{fresh.length - 60} {lang ? 'أخرى' : 'more'}</span>}
                  </>
                : <span className="hint">{lang ? 'لا جديد لإضافته.' : 'Nothing new to add.'}</span>}
            </div>
            {generated.length >= MAX_GENERATED && (
              <div className="bulk-dupe" style={{ marginTop: 8 }}>
                <TriangleAlert size={12} /> {lang ? `الحد الأقصى ${MAX_GENERATED} في المرة.` : `Capped at ${MAX_GENERATED} per batch.`}
              </div>
            )}
          </div>
        </div>

        <div className="mf">
          <button type="button" className="btn ghost" onClick={onCancel}>{lang ? 'إلغاء' : 'Cancel'}</button>
          <button type="button" className="btn" disabled={busy || !fresh.length}
            onClick={() => onAdd(fresh, unitsPerBuilding === '' ? null : Number(unitsPerBuilding))}>
            {busy ? <LoaderCircle size={14} /> : <Plus size={14} />}{' '}
            {lang ? `إضافة ${fresh.length}` : `Add ${fresh.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

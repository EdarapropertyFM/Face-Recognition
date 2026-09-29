import { useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Trash2, Upload, UserPlus } from 'lucide-react';
import EnrollmentProgress from './EnrollmentProgress';
import FormField from './FormField';
import SelectField from './SelectField';
import MemberFaceCapture from './MemberFaceCapture';
import { compressImageFile } from '../../utils/image';
import {
  RELATIONS, collectsMobile, emptyMember, requiresNationalId, validateMembers,
} from '../../utils/household';

const RELATION_OPTIONS = RELATIONS.map((relation) => relation.value);

export default function HouseholdStep({ members, onChange, onBack, onContinue }) {
  const [errors, setErrors] = useState([]);
  const [capturing, setCapturing] = useState(null);   // member id whose camera is open

  const update = (index, patch) => {
    const next = members.map((member, position) => (position === index ? { ...member, ...patch } : member));
    onChange(next);
    if (errors.length) setErrors([]);
  };

  const addMember = () => onChange([...members, emptyMember()]);
  const removeMember = (index) => {
    onChange(members.filter((_, position) => position !== index));
    setErrors([]);
  };

  const attachIdCard = async (index, file) => {
    if (!file) return update(index, { idDocImage: '' });
    try {
      update(index, { idDocImage: await compressImageFile(file), idDocName: file.name });
    } catch {
      update(index, { idDocImage: '', idDocName: '' });
    }
  };

  const next = () => {
    const found = validateMembers(members);
    setErrors(found);
    if (found.every((entry) => Object.keys(entry).length === 0)) onContinue();
  };

  return (
    <section className="enrollment-card" aria-labelledby="household-title">
      <EnrollmentProgress currentStep={3} totalSteps={5} />
      <p className="enrollment-step-label">Step 3 of 5 · Household</p>
      <h1 id="household-title">Who else lives or works here?</h1>
      <p className="enrollment-subtitle">
        Everyone who should be recognised at the gate needs their own details and face photos.
        Hand the phone to each person in turn. Leave this empty if you live alone.
      </p>

      {members.map((member, index) => {
        const memberErrors = errors[index] ?? {};
        const showNationalId = requiresNationalId(member.age);
        const showMobile = collectsMobile(member.relation);
        const facesDone = (member.faces?.length ?? 0) >= 3;

        return (
          <div className="enrollment-repeatable" key={member.id}>
            <header>
              <h2>{member.name?.trim() || `Person ${index + 1}`}{member.relation ? ` · ${member.relation}` : ''}</h2>
              <button type="button" onClick={() => removeMember(index)} aria-label={`Remove person ${index + 1}`}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </header>

            <FormField id={`member-name-${member.id}`} label="Full name" value={member.name}
              error={memberErrors.name} required
              onChange={(event) => update(index, { name: event.target.value })} />

            <div className="enrollment-grid">
              <SelectField id={`member-relation-${member.id}`} label="Relationship" value={member.relation}
                error={memberErrors.relation} options={RELATION_OPTIONS} placeholder="Select relationship" required
                onChange={(event) => update(index, { relation: event.target.value })} />
              <FormField id={`member-age-${member.id}`} label="Age" value={member.age}
                error={memberErrors.age} inputMode="numeric" maxLength={3} required
                onChange={(event) => update(index, { age: event.target.value.replace(/\D/g, '').slice(0, 3) })} />
            </div>

            {/* A National ID exists only from 16; below that it is not shown at all. */}
            {showNationalId && (
              <FormField id={`member-nid-${member.id}`} label="National ID" value={member.nid}
                error={memberErrors.nid} inputMode="numeric" maxLength={14} required
                onChange={(event) => update(index, { nid: event.target.value.replace(/\D/g, '').slice(0, 14) })} />
            )}

            <div className="enrollment-grid">
              {/* Staff are recorded without a personal phone number. */}
              {showMobile && (
                <FormField id={`member-mobile-${member.id}`} label="Mobile number" value={member.mobile}
                  error={memberErrors.mobile} inputMode="tel" maxLength={11} required
                  onChange={(event) => update(index, { mobile: event.target.value.replace(/\D/g, '').slice(0, 11) })} />
              )}
              <FormField id={`member-email-${member.id}`} label="Email (optional)" type="email" value={member.email}
                error={memberErrors.email}
                onChange={(event) => update(index, { email: event.target.value })} />
            </div>

            {showNationalId && (
              <div className={`enrollment-document ${memberErrors.idDoc ? 'has-error' : ''}`}>
                <span className="enrollment-document-label">National ID card *</span>
                <label htmlFor={`member-doc-${member.id}`}>
                  {member.idDocImage ? <CheckCircle2 size={20} aria-hidden="true" /> : <Upload size={20} aria-hidden="true" />}
                  <span>
                    <strong>{member.idDocImage ? (member.idDocName || 'National ID card attached') : 'Upload National ID card'}</strong>
                    <small>JPG, PNG or WebP · maximum 5 MB</small>
                  </span>
                  <input id={`member-doc-${member.id}`} type="file" accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => attachIdCard(index, event.target.files?.[0] ?? null)} />
                </label>
                {memberErrors.idDoc ? <p className="enrollment-field-error">{memberErrors.idDoc}</p> : null}
              </div>
            )}

            {capturing === member.id ? (
              <MemberFaceCapture
                memberName={member.name}
                initialCaptures={member.faces ?? []}
                onCapturesChange={(faces) => update(index, { faces })}
                onAiPersonId={(aiPersonId) => update(index, { aiPersonId })}
                onDone={() => setCapturing(null)}
                onCancel={() => setCapturing(null)}
              />
            ) : (
              <div className={`member-face-row ${memberErrors.faces ? 'has-error' : ''}`}>
                <div>
                  <strong>{facesDone ? 'Face photos captured' : 'Face photos'}</strong>
                  <small>{facesDone ? 'Added to the recognition gallery.' : 'Three photos, taken on this phone.'}</small>
                </div>
                <button type="button" className="enrollment-button secondary" onClick={() => setCapturing(member.id)}>
                  {facesDone ? <><Camera size={15} /> Retake</> : <><Camera size={15} /> Capture faces</>}
                </button>
              </div>
            )}
            {memberErrors.faces ? <p className="enrollment-field-error">{memberErrors.faces}</p> : null}
          </div>
        );
      })}

      <button className="enrollment-add-button" type="button" onClick={addMember}>
        <UserPlus size={18} aria-hidden="true" /> {members.length ? 'Add another person' : 'Add a person'}
      </button>

      <div className="enrollment-actions">
        <button className="enrollment-button secondary" type="button" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden="true" /> Back
        </button>
        <button className="enrollment-button" type="button" onClick={next}>
          Continue <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

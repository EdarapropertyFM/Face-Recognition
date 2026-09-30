import { ArrowLeft, Building2, Car, CheckCircle2, FileCheck2, LoaderCircle, Pencil, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import EnrollmentProgress from './EnrollmentProgress';
import { draftResidences } from '../../utils/enrollment';

function ReviewSection({ icon: Icon, title, onEdit, children }) {
  return (
    <section className="review-section">
      <header><span><Icon size={18} /> {title}</span><button type="button" onClick={onEdit}><Pencil size={14} /> Edit</button></header>
      <div>{children}</div>
    </section>
  );
}

export default function ReviewSubmitStep({ draft, faceCaptures, members, vehicles, submitting, submitError, onEdit, onBack, onSubmit }) {
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState('');
  const submit = () => {
    if (!consent) {
      setConsentError('Please confirm the consent statement before submitting.');
      return;
    }
    setConsentError('');
    onSubmit();
  };

  return (
    <section className="enrollment-card" aria-labelledby="review-title">
      <EnrollmentProgress currentStep={5} totalSteps={5} />
      <p className="enrollment-step-label">Step 5 of 5 · Review & consent</p>
      <h1 id="review-title">Review your application</h1>
      <p className="enrollment-subtitle">Check everything carefully. Your request will remain pending until an administrator validates it.</p>

      <ReviewSection icon={Building2} title="Residence and identity" onEdit={() => onEdit(1)}>
        <dl className="review-grid">
          {/* Every unit the resident holds, not just the primary one. */}
          <div><dt>{draftResidences(draft).length > 1 ? 'Units' : 'Unit'}</dt><dd>
            {draftResidences(draft).map((residence) => (
              <div key={residence.id}>{residence.project} · {residence.building} · {residence.unit}</div>
            ))}
          </dd></div>
          <div><dt>Registering as</dt><dd>{draft.residentType === 'tenant' ? 'Tenant' : 'Owner'}</dd></div>
          <div><dt>Full name</dt><dd>{draft.name}</dd></div>
          <div><dt>National ID</dt><dd>{draft.nid}</dd></div>
          <div><dt>Mobile</dt><dd>{draft.mobile}</dd></div>
          <div><dt>Email</dt><dd>{draft.email || '—'}</dd></div>
          <div><dt>ID card</dt><dd><FileCheck2 size={15} /> {draft.idDocName || 'Attached'}</dd></div>
          {draft.residentType === 'tenant' && <div><dt>Rental agreement</dt><dd><FileCheck2 size={15} /> {draft.leasePages?.length || 0} {draft.leasePages?.length === 1 ? 'page' : 'pages'}</dd></div>}
        </dl>
      </ReviewSection>

      <ReviewSection icon={ShieldCheck} title={`Face photos (${faceCaptures.length}/3)`} onEdit={() => onEdit(2)}>
        <div className="review-faces">{faceCaptures.map((capture) => <img src={capture.image} alt={capture.label} title={capture.label} key={capture.key} />)}</div>
      </ReviewSection>

      <ReviewSection icon={Users} title={`Household members (${members.length})`} onEdit={() => onEdit(3)}>
        {/* Their faces, not just their names: this is the last chance to
            notice that the wrong person was captured for a member, and a
            name alone cannot show that. */}
        {members.length ? <ul className="review-list review-list--people">{members.map((member) => {
          // Captures are [{ key, label, image, quality }], in pose order.
          const shots = (member.faces ?? []).map((capture) => capture?.image).filter(Boolean);
          return (
            <li key={member.id}>
              <div className="review-person">
                <div className="review-person-shots">
                  {shots.length
                    ? shots.slice(0, 3).map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)
                    : <span className="review-person-none">No photos</span>}
                </div>
                <div>
                  <b>{member.name}</b>
                  <span>{member.relation}{member.nid ? ` · ${member.nid}` : ''}</span>
                </div>
              </div>
            </li>
          );
        })}</ul> : <p className="review-none">No household members.</p>}
      </ReviewSection>

      <ReviewSection icon={Car} title={`Vehicles (${vehicles.length})`} onEdit={() => onEdit(4)}>
        {vehicles.length ? <ul className="review-list review-list--people">{vehicles.map((vehicle) => (
          <li key={vehicle.id}>
            <div className="review-person">
              <div className="review-person-shots">
                {vehicle.licence
                  ? <img src={vehicle.licence} alt="Vehicle licence" loading="lazy" />
                  : <span className="review-person-none">No licence</span>}
              </div>
              <div>
                <b>{vehicle.plate}</b>
                <span>{vehicle.color}{vehicle.make ? ` · ${vehicle.make}` : ''}</span>
              </div>
            </div>
          </li>
        ))}</ul> : <p className="review-none">No vehicles.</p>}
      </ReviewSection>

      <label className={`enrollment-consent ${consentError ? 'has-error' : ''}`}>
        <input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setConsentError(''); }} />
        <span>I confirm the information is correct and consent to STMC collecting and using the submitted identity and facial data for community access and security under PDPL (Law 151/2020).</span>
      </label>
      {consentError ? <p className="enrollment-field-error">{consentError}</p> : null}
      {submitError ? <div className="enrollment-submit-error" role="alert">{submitError}</div> : null}

      <div className="enrollment-actions">
        <button className="enrollment-button secondary" type="button" onClick={onBack} disabled={submitting}><ArrowLeft size={18} /> Back</button>
        <button className="enrollment-button" type="button" onClick={submit} disabled={submitting}>
          {submitting ? <><LoaderCircle className="spin" size={18} /> Submitting…</> : <><CheckCircle2 size={18} /> Submit for validation</>}
        </button>
      </div>
    </section>
  );
}

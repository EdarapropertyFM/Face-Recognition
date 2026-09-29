import { Building2 } from 'lucide-react';
import { useState } from 'react';
import FaceCaptureStep from '../components/enrollment/FaceCaptureStep';
import EnrollmentSuccess from '../components/enrollment/EnrollmentSuccess';
import HouseholdStep from '../components/enrollment/HouseholdStep';
import ResidenceIdentityStep from '../components/enrollment/ResidenceIdentityStep';
import ResidentTypeStep from '../components/enrollment/ResidentTypeStep';
import ReviewSubmitStep from '../components/enrollment/ReviewSubmitStep';
import VehiclesStep from '../components/enrollment/VehiclesStep';
import { useEnrollmentDraft } from '../hooks/useEnrollmentDraft';
import { useResidenceOptions } from '../hooks/useResidenceOptions';
import { apiFetch } from '../api';
import { compressImageFile } from '../utils/image';
import { memberPayload } from '../utils/household';
import { draftResidences } from '../utils/enrollment';
import ErrorBoundary from '../components/ErrorBoundary';
import './EnrollmentPage.css';

export default function EnrollmentPage() {
  const {
    projects, loading: projectsLoading, error: projectsError, reload: reloadProjects,
  } = useResidenceOptions();
  const {
    draft, errors, identityDocument, faceCaptures, aiPersonId, step, updateField,
    updateResidence, addResidence, removeResidence,
    setIdentityDocument, addLeasePages, removeLeasePage, setResidentType, updateFaceCaptures, setAiPersonId, setFamily, setCars, clearSavedDraft,
    goToStep, validateResidence, resumable, resumeStep,
  } = useEnrollmentDraft();
  // Offered, never applied silently: on a shared phone or tablet the next
  // person must not inherit someone else's half-finished registration.
  const [resumeOffer, setResumeOffer] = useState(resumable);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedRef, setSubmittedRef] = useState('');
  // Owner or tenant is asked first; a resumed draft that already chose skips it.
  const [typeConfirmed, setTypeConfirmed] = useState(Boolean(draft.residentType));
  const tenant = draft.residentType === 'tenant';

  const continueToFaceCapture = () => {
    if (validateResidence(projects)) {
      goToStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submitEnrollment = async () => {
    if (tenant && !draft.leasePages?.length) {
      setSubmitError('Your rental agreement is required. Go back to step 1 and attach it.');
      return;
    }
    if ((!identityDocument && !draft.idDocImage) || faceCaptures.length !== 5) {
      setSubmitError('Your ID card and all five face photos are required. Go back and capture them again.');
      return;
    }
    if (!aiPersonId) {
      setSubmitError('The face photos were not added to the recognition gallery. Go back and retake them.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const idCard = identityDocument ? await compressImageFile(identityDocument) : draft.idDocImage;
      const rentalAgreement = tenant ? draft.leasePages.map((page) => page.image) : undefined;
      const faces = Object.fromEntries(faceCaptures.map((capture) => [capture.key, capture.image]));
      const payload = {
        schema: 'stmc.enroll.v1',
        residentType: tenant ? 'tenant' : 'owner',
        building: draft.building,
        unit: draft.unit,
        // Every unit this resident holds; the first is the primary one above.
        residences: draftResidences(draft).map(({ project, building, unit }) => ({ project, building, unit })),
        submittedAt: new Date().toISOString(),
        owner: {
          name: draft.name.trim(), age: Number(draft.age), nid: draft.nid || null, mobile: draft.mobile,
          email: draft.email.trim() || null, nationalIdCard: idCard, faces,
          ...(tenant ? { rentalAgreement } : {}),
          consentAcceptedAt: new Date().toISOString(), consentVersion: 'pdpl-v1',
        },
        family: draft.family.map(memberPayload),
        cars: draft.cars.map(({ id: _id, ...vehicle }) => vehicle),
        aiPersonId,
      };
      const response = await apiFetch('/enrollments/self-service', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(', ') : result.message || 'Could not submit the application.');
      setSubmittedRef(result.ref);
      clearSavedDraft();
      goToStep(6);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSubmitError(error.message || 'Could not submit the application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="enrollment-page">
      <div className="enrollment-shell">
        <header className="enrollment-brand" aria-label="STMC secure enrollment">
          <span className="enrollment-brand-mark"><Building2 size={24} aria-hidden="true" /></span>
          <span><strong>STMC</strong><small>Secure enrollment</small></span>
        </header>
        {resumeOffer && <div className="enrollment-resume" role="status">
          <div>
            <b>You have an unfinished registration</b>
            <p>{`Saved on this device${faceCaptures.length ? ` with ${faceCaptures.length} face photo(s)` : ''}. Continue where you left off, or start again.`}</p>
          </div>
          <div className="enrollment-resume-actions">
            <button type="button" className="enrollment-button" onClick={() => { setResumeOffer(false); goToStep(resumeStep); }}>
              Continue
            </button>
            <button type="button" className="enrollment-button secondary" onClick={() => { clearSavedDraft(); setResumeOffer(false); setTypeConfirmed(false); goToStep(1); }}>
              Start again
            </button>
          </div>
        </div>}
        <ErrorBoundary>
          {step === 1 && !typeConfirmed ? (
            <ResidentTypeStep value={draft.residentType} onChange={setResidentType}
              onContinue={() => { setTypeConfirmed(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          ) : step === 1 ? (
            <ResidenceIdentityStep
              draft={draft}
              errors={errors}
              projects={projects}
              projectsLoading={projectsLoading}
              projectsError={projectsError}
              onRetryProjects={reloadProjects}
              onChange={updateField}
              onResidenceChange={updateResidence}
              onAddResidence={addResidence}
              onRemoveResidence={removeResidence}
              onDocumentChange={setIdentityDocument}
              onAddLeasePages={addLeasePages}
              onRemoveLeasePage={removeLeasePage}
              onChangeResidentType={() => setTypeConfirmed(false)}
              onContinue={continueToFaceCapture}
            />
          ) : step === 2 ? (
            <FaceCaptureStep
              onAiPersonId={setAiPersonId}
              initialCaptures={faceCaptures}
              onBack={() => goToStep(1)}
              onComplete={() => goToStep(3)}
              onCapturesChange={updateFaceCaptures}
            />
          ) : step === 3 ? (
            <HouseholdStep members={draft.family} onChange={setFamily} onBack={() => goToStep(2)} onContinue={() => goToStep(4)} />
          ) : step === 4 ? (
            <VehiclesStep vehicles={draft.cars} onChange={setCars} onBack={() => goToStep(3)} onContinue={() => goToStep(5)} />
          ) : step === 5 ? (
            <ReviewSubmitStep
              draft={draft} faceCaptures={faceCaptures} members={draft.family} vehicles={draft.cars}
              submitting={submitting} submitError={submitError} onEdit={goToStep}
              onBack={() => goToStep(4)} onSubmit={submitEnrollment}
            />
          ) : <EnrollmentSuccess reference={submittedRef} />}
        </ErrorBoundary>
        <footer className="enrollment-footer">
          Protected under PDPL (151/2020) — used only for community access and security.
        </footer>
      </div>
    </main>
  );
}

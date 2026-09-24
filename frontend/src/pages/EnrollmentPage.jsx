import { Building2 } from 'lucide-react';
import { useState } from 'react';
import FaceCaptureStep from '../components/enrollment/FaceCaptureStep';
import EnrollmentSuccess from '../components/enrollment/EnrollmentSuccess';
import HouseholdStep from '../components/enrollment/HouseholdStep';
import ResidenceIdentityStep from '../components/enrollment/ResidenceIdentityStep';
import ReviewSubmitStep from '../components/enrollment/ReviewSubmitStep';
import VehiclesStep from '../components/enrollment/VehiclesStep';
import { useEnrollmentDraft } from '../hooks/useEnrollmentDraft';
import { useBuildingOptions } from '../hooks/useBuildingOptions';
import { apiFetch } from '../api';
import { compressImageFile } from '../utils/image';
import ErrorBoundary from '../components/ErrorBoundary';
import './EnrollmentPage.css';

export default function EnrollmentPage() {
  const { buildings, loading: buildingsLoading, error: buildingsError, reload: reloadBuildings } = useBuildingOptions();
  const {
    draft, errors, identityDocument, faceCaptures, aiPersonId, step, updateField, updateBuilding,
    setIdentityDocument, updateFaceCaptures, setAiPersonId, setFamily, setCars, clearSavedDraft,
    goToStep, validateResidence,
  } = useEnrollmentDraft();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedRef, setSubmittedRef] = useState('');

  const continueToFaceCapture = () => {
    if (validateResidence(buildings)) {
      goToStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const submitEnrollment = async () => {
    if (!identityDocument || faceCaptures.length !== 5) {
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
      const idCard = await compressImageFile(identityDocument);
      const faces = Object.fromEntries(faceCaptures.map((capture) => [capture.key, capture.image]));
      const payload = {
        schema: 'stmc.enroll.v1',
        building: draft.building,
        unit: draft.unit,
        submittedAt: new Date().toISOString(),
        owner: {
          name: draft.name.trim(), nid: draft.nid, mobile: draft.mobile,
          email: draft.email.trim() || null, nationalIdCard: idCard, faces,
          consentAcceptedAt: new Date().toISOString(), consentVersion: 'pdpl-v1',
        },
        family: draft.family.map(({ id: _id, ...member }) => member),
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
        <ErrorBoundary>
          {step === 1 ? (
            <ResidenceIdentityStep
              draft={draft}
              errors={errors}
              buildings={buildings}
              buildingsLoading={buildingsLoading}
              buildingsError={buildingsError}
              onRetryBuildings={reloadBuildings}
              onChange={updateField}
              onBuildingChange={updateBuilding}
              onDocumentChange={setIdentityDocument}
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

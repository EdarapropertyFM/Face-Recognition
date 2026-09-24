import { useCallback, useEffect, useState } from 'react';
import { EMPTY_ENROLLMENT_DRAFT, sanitizeStoredDraft, validateResidenceDraft } from '../utils/enrollment';
import { compressImageFile } from '../utils/image';
import {
  clearStoredDraft, isResumable, readStoredDraft, sanitizeStoredCaptures, writeStoredDraft,
} from '../utils/enrollmentDraftStorage';

const saved = readStoredDraft();

export function useEnrollmentDraft() {
  const [draft, setDraft] = useState(() => sanitizeStoredDraft(saved ?? {}));
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [identityDocument, setIdentityDocumentState] = useState(null);
  // Restored with the draft: retaking five photos because a tab closed is the
  // single most annoying way to lose a registration.
  const [faceCaptures, setFaceCaptures] = useState(() => sanitizeStoredCaptures(saved?.faceCaptures));
  // The AI gallery person created when the five photos were captured. Carried
  // through to submit so the enrollment claims it instead of enrolling again.
  const [aiPersonId, setAiPersonId] = useState(saved?.aiPersonId ?? null);
  // Offered on load, not applied silently: a stranger picking up the tablet
  // must not inherit someone else's half-finished registration unknowingly.
  const [resumable] = useState(() => isResumable(saved));
  const [resumeStep] = useState(() => Number(saved?.step) || 1);

  useEffect(() => {
    // The ID-card file cannot be serialised, so idDocName is cleared and the
    // applicant re-attaches it; everything else survives.
    writeStoredDraft({ ...draft, idDocName: '', faceCaptures, aiPersonId, step });
  }, [draft, faceCaptures, aiPersonId, step]);

  const clearFieldError = (field) => setErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });

  const updateField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  };

  const updateBuilding = (building) => {
    setDraft((current) => ({ ...current, building, unit: '' }));
    clearFieldError('building');
    clearFieldError('unit');
  };

  const setIdentityDocument = (file) => {
    setIdentityDocumentState(file);
    setDraft((current) => ({ ...current, idDocName: file?.name ?? '', idDocImage: '' }));
    clearFieldError('idDoc');
    // A File cannot be serialised, so a resumed draft would have lost the ID
    // card and stalled at submit. Compress it now and keep the data URL, which
    // is what the API receives anyway.
    if (!file) return;
    compressImageFile(file)
      .then((image) => setDraft((current) => ({ ...current, idDocImage: image })))
      .catch(() => undefined);      // submit re-compresses from the File if this fails
  };

  const validateResidence = (buildings) => {
    const nextErrors = validateResidenceDraft(draft, identityDocument, buildings);
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const updateFaceCaptures = useCallback((captures) => {
    setFaceCaptures(captures);
  }, []);

  const setFamily = useCallback((family) => {
    setDraft((current) => ({ ...current, family }));
  }, []);

  const setCars = useCallback((cars) => {
    setDraft((current) => ({ ...current, cars }));
  }, []);

  const clearSavedDraft = useCallback(() => {
    clearStoredDraft();
    setDraft({ ...EMPTY_ENROLLMENT_DRAFT, family: [], cars: [] });
    setFaceCaptures([]);
    setAiPersonId(null);
    setIdentityDocumentState(null);
    setErrors({});
  }, []);

  return {
    draft, errors, identityDocument, faceCaptures, aiPersonId, step, updateField, updateBuilding,
    setIdentityDocument, updateFaceCaptures, setAiPersonId, setFamily, setCars, clearSavedDraft,
    goToStep: setStep, validateResidence, resumable, resumeStep,
  };
}

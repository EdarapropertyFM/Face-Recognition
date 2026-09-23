import { useCallback, useEffect, useState } from 'react';
import { EMPTY_ENROLLMENT_DRAFT, sanitizeStoredDraft, validateResidenceDraft } from '../utils/enrollment';

const DRAFT_STORAGE_KEY = 'stmc.enrollment.draft.v1';

function loadDraft() {
  try {
    const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return stored ? sanitizeStoredDraft(JSON.parse(stored)) : { ...EMPTY_ENROLLMENT_DRAFT };
  } catch {
    return { ...EMPTY_ENROLLMENT_DRAFT };
  }
}

export function useEnrollmentDraft() {
  const [draft, setDraft] = useState(loadDraft);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [identityDocument, setIdentityDocumentState] = useState(null);
  const [faceCaptures, setFaceCaptures] = useState([]);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...draft, idDocName: '' }));
  }, [draft]);

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
    setDraft((current) => ({ ...current, idDocName: file?.name ?? '' }));
    clearFieldError('idDoc');
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
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraft({ ...EMPTY_ENROLLMENT_DRAFT, family: [], cars: [] });
    setFaceCaptures([]);
    setIdentityDocumentState(null);
    setErrors({});
  }, []);

  return {
    draft, errors, identityDocument, faceCaptures, step, updateField, updateBuilding,
    setIdentityDocument, updateFaceCaptures, setFamily, setCars, clearSavedDraft,
    goToStep: setStep, validateResidence,
  };
}

/** Response shape of POST /persons/{id}/enroll on the Python AI service. */
export type AiEnrollment = {
  enrolled: number;
  template_count: number;
  rejected: Array<{ filename: string; reasons: string[] }>;
  pairwise_similarity: { min: number | null; mean: number | null };
  model_version: string;
};

/** Photos of one person should score ~0.6+ against each other. */
export const WEAK_SELF_CHECK = 0.5;

/**
 * Why an enrollment that returned HTTP 200 is still unusable, or null if it
 * is fine. The AI answers 200 even when it rejected every photo; an unchecked
 * response leaves an AI person holding zero templates, so the resident looks
 * approved and synced but can never be recognized.
 */
export function enrollmentFailure(enrollment: AiEnrollment | undefined, sent: number): string | null {
  const enrolled = enrollment?.enrolled ?? 0;
  if (enrolled >= sent) return null;
  const reasons = (enrollment?.rejected ?? [])
    .map((r) => `${r.filename}: ${r.reasons.join(', ')}`)
    .join(' | ') || 'no reason reported';
  return `AI accepted only ${enrolled} of ${sent} face photos, so the person has no usable `
    + `face templates. Recapture the photos. Rejections: ${reasons}`;
}

/** Operator-facing summary of a successful enrollment, flagging a weak self-check. */
export function enrollmentNote(enrollment: AiEnrollment | undefined): string {
  const similarity = enrollment?.pairwise_similarity?.min ?? null;
  const templates = enrollment?.template_count ?? 0;
  if (similarity !== null && similarity < WEAK_SELF_CHECK) {
    return `AI enrollment completed with a WEAK self-check (min similarity ${similarity.toFixed(3)} `
      + `< ${WEAK_SELF_CHECK}). The five photos may not all be the same person, or capture quality `
      + 'is poor. Recognition may be unreliable.';
  }
  return `AI enrollment completed successfully (${templates} face templates`
    + (similarity === null ? ')' : `, min self-similarity ${similarity.toFixed(3)})`);
}

/**
 * Which units are closed to a new OWNER registration.
 *
 * A unit has exactly one owner. Once that owner has submitted, the unit must
 * stop appearing as a free choice in the enrolment form, or a second person
 * can claim the same property and the register no longer says who is
 * responsible for it.
 *
 * A rejected registration does not hold the unit: the whole point of
 * rejecting one is to let the right person register instead.
 *
 * Tenants are deliberately NOT blocked. An owner registering their flat is
 * the normal case BEFORE they rent it out, and locking the unit outright
 * would leave the tenant who actually lives there unable to register at all,
 * which is the one thing this system cannot afford to get wrong.
 */

export interface OwnerClaim {
  ref: string;
  status: string;
  residentType: string;
  ownerName?: string | null;
  residences: Array<{ project?: string; building?: string; unit?: string }>;
}

/** Key for one unit. Building codes repeat across projects, so all three. */
export function unitKey(project: string, building: string, unit: string): string {
  return [project, building, unit].map((part) => String(part ?? '').trim().toLowerCase()).join('|');
}

const HOLDS_THE_UNIT = (status: string) => String(status ?? '').toLowerCase() !== 'rejected';

/**
 * Every unit already claimed by an owner, mapped to the name on the claim so
 * the form can say WHO holds it rather than only that it is unavailable.
 */
export function ownerClaimedUnits(claims: OwnerClaim[]): Map<string, string> {
  const held = new Map<string, string>();
  for (const claim of claims ?? []) {
    if (String(claim?.residentType ?? 'owner').toLowerCase() !== 'owner') continue;
    if (!HOLDS_THE_UNIT(claim.status)) continue;
    for (const residence of claim.residences ?? []) {
      if (!residence?.project || !residence?.building || !residence?.unit) continue;
      const key = unitKey(residence.project, residence.building, residence.unit);
      if (!held.has(key)) held.set(key, String(claim.ownerName ?? '').trim());
    }
  }
  return held;
}

/**
 * The units a submission is trying to take that somebody else already owns.
 * `excludeRef` keeps an enrolment from colliding with itself on an edit.
 */
export function conflictingUnits(
  held: Map<string, string>,
  residences: Array<{ project?: string; building?: string; unit?: string }>,
  residentType: string,
  heldBy?: Map<string, string>,
  excludeRef?: string,
): string[] {
  if (String(residentType ?? 'owner').toLowerCase() !== 'owner') return [];
  const clashes: string[] = [];
  for (const residence of residences ?? []) {
    if (!residence?.project || !residence?.building || !residence?.unit) continue;
    const key = unitKey(residence.project, residence.building, residence.unit);
    if (!held.has(key)) continue;
    if (excludeRef && heldBy?.get(key) === excludeRef) continue;
    clashes.push(residence.unit);
  }
  return clashes;
}

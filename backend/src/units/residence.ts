/**
 * A resident may hold more than one unit — a second flat in another building,
 * or one in a different project entirely. Enrolments therefore carry a list of
 * residences, while the older single `building`/`unit` pair is kept as the
 * primary one so existing rows and reports keep working.
 */
export interface Residence {
  project: string;
  building: string;
  unit: string;
}

/** Trim and drop anything without all three parts. */
export function cleanResidences(input: unknown): Residence[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Residence[] = [];
  for (const row of input) {
    const project = String((row as Residence)?.project ?? '').trim();
    const building = String((row as Residence)?.building ?? '').trim();
    const unit = String((row as Residence)?.unit ?? '').trim();
    if (!project || !building || !unit) continue;
    const key = `${project}\u0000${building}\u0000${unit}`.toLowerCase();
    if (seen.has(key)) continue;          // the same flat listed twice is one flat
    seen.add(key);
    out.push({ project, building, unit });
  }
  return out;
}

/**
 * Every residence an enrolment covers, newest schema first and falling back to
 * the legacy single building/unit columns so rows written before multi-unit
 * support still count towards their building.
 */
export function residencesOf(
  enrollment: { residences?: unknown; building?: string | null; unit?: string | null },
  projectOfBuilding: (building: string) => string,
): Residence[] {
  const listed = cleanResidences(enrollment.residences);
  if (listed.length) return listed;
  const building = (enrollment.building ?? '').trim();
  const unit = (enrollment.unit ?? '').trim();
  if (!building || !unit) return [];
  return [{ project: projectOfBuilding(building), building, unit }];
}

/** Unit codes for a building: the exact list if given, else generated. */
export function unitCodesFor(buildingCode: string, totalUnits: number, unitCodes: string[]): string[] {
  if (unitCodes?.length) return unitCodes;
  return Array.from({ length: Math.max(0, totalUnits) }, (_, index) =>
    `${buildingCode}-${String(index + 1).padStart(2, '0')}`);
}

/** Case-insensitive substring match used by the Units search box. */
export function matches(query: string, ...fields: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle));
}

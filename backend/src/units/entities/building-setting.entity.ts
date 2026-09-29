import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Admin-supplied detail for a building.
 *
 * The list of projects and buildings itself is NOT stored: it is derived from
 * the cameras that have been installed, so a building exists in the Units
 * module because there is a camera watching it. This table only carries what
 * no camera can tell us — the display name, how many units the building really
 * has (needed for the coverage bar), and the exact unit codes residents may
 * pick from at enrolment.
 *
 * The key is project + code, because two projects may reuse a building code.
 */
@Entity('building_settings')
export class BuildingSetting {
  @PrimaryColumn()
  project: string;

  @PrimaryColumn()
  code: string;

  @Column('simple-array', { default: '' })
  name: string[];

  /** Real number of units in the building; 0 means "not told yet". */
  @Column({ default: 0 })
  totalUnits: number;

  /** Exact unit codes offered at enrolment. Empty = generate from totalUnits. */
  @Column('jsonb', { default: [] })
  unitCodes: string[];

  /**
   * Registered owner per unit, keyed by unit code.
   *
   * This is the property register, which exists before anybody enrols a
   * face: management knows who owns 4.6C-1 long before that person walks
   * past a camera. Keeping it here means the Units module can show an
   * occupied building with named owners, and a later face enrolment has
   * something to be matched against rather than arriving with no context.
   *
   * Only the name is held. No contact details: the community has no reason
   * to keep a phone number it was not asked to collect.
   */
  @Column('jsonb', { default: {} })
  unitOwners: Record<string, string>;
}

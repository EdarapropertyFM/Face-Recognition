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
}

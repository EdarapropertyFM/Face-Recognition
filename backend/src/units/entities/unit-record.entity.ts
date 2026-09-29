import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * The community's unit register: every unit in every building of every
 * project, and who owns it. This is reference data supplied by the property
 * manager (imported), independent of who has registered through STMC.
 *
 * `source` is 'demo' for the placeholder rows seeded until the real register
 * is imported, and 'import' for real rows.
 */
@Entity('unit_registry')
@Index(['project', 'building', 'unit'], { unique: true })
export class UnitRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  project: string;

  @Column()
  building: string;

  @Column()
  unit: string;

  @Column({ type: 'varchar', nullable: true })
  ownerName: string | null;

  @Column({ type: 'varchar', nullable: true })
  ownerPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  floor: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ default: 'demo' })
  source: string;
}

import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * A community the system covers, e.g. "West Town Residence".
 *
 * Projects used to exist only as a by-product of the cameras installed, which
 * meant a project could not be set up before its hardware arrived and could
 * never be renamed or removed. They are records in their own right now, owned
 * by the admin panel, so a project and its buildings can be prepared first and
 * registration can open before a single camera is mounted.
 *
 * The name is the key: it is what cameras, enrolments and building settings
 * all refer to, so renaming one cascades to those.
 */
@Entity('projects')
export class Project {
  @PrimaryColumn()
  name: string;

  /** [English, Arabic] display name; falls back to the key when unset. */
  @Column('simple-array', { default: '' })
  label: string[];

  /** Hidden from the enrolment form without deleting its history. */
  @Column({ default: true })
  active: boolean;
}

import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

@Entity('enrollments')
export class Enrollment {
  @PrimaryColumn()
  ref: string;

  @Column()
  schema: string;

  @Column()
  status: string; // pending, approved, rejected

  // The primary residence, kept as plain columns so existing reports and
  // lookups keep working. A resident may hold several units across projects;
  // the full list lives in `residences`, whose first entry is this one.
  // 'owner' or 'tenant'. A tenant's owner.rentalAgreement holds the lease image.
  @Column({ default: 'owner' })
  residentType: string;

  @Column()
  building: string;

  @Column()
  unit: string;

  @Column('jsonb', { default: [] })
  residences: Array<{ project: string; building: string; unit: string }>;

  @Column()
  submittedAt: string;

  @Column('jsonb')
  owner: any;

  @Column('jsonb', { default: [] })
  family: any[];

  @Column('jsonb', { default: [] })
  cars: any[];

  @Column({ nullable: true })
  faceId: string;

  // Set as soon as the five photos are captured: the person is provisioned in
  // the AI gallery immediately, so they are recognizable before an admin has
  // reviewed the paperwork. Approval reuses this id instead of enrolling
  // again; rejection and deletion remove it from the gallery.
  @Index()
  @Column({ nullable: true })
  aiPersonId: string;

  @Column({ nullable: true })
  validationNote: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  nationalIdNormalized: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  mobileNormalized: string;

  @Column({ default: 'not_started' })
  aiSyncStatus: string;

  @Column({ default: 0 })
  syncAttempts: number;

  @Column('jsonb', { default: [] })
  auditLog: Array<Record<string, unknown>>;
}

import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

@Entity('enrollments')
export class Enrollment {
  @PrimaryColumn()
  ref: string;

  @Column()
  schema: string;

  @Column()
  status: string; // pending, approved, rejected

  @Column()
  building: string;

  @Column()
  unit: string;

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

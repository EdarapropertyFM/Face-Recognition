import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

@Entity('faces')
export class Face {
  @PrimaryColumn()
  id: string;

  @Column('simple-array')
  name: string[]; // [English, Arabic]

  @Column()
  type: string; // known, staff, unknown, watch

  @Column('simple-array')
  role: string[]; // [English, Arabic]

  @Column()
  idno: string;

  @Column()
  issuer: string;

  @Column()
  enroll: string;

  @Column({ nullable: true })
  img: string;

  @Column({ nullable: true })
  bldg: string;

  @Column({ nullable: true })
  unit: string;

  @Column({ nullable: true })
  ban: string;

  @Column({ nullable: true })
  aiPersonId: string;

  /**
   * The enrolment this person registered through. The Face Database lists
   * only people who came through the enrolment site, so a row without this
   * is not shown: it was added straight to the AI gallery by a script or the
   * webcam page and never went through registration or consent.
   */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  enrollmentRef: string | null;
}

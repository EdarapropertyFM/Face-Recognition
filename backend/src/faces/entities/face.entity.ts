import { Entity, Column, PrimaryColumn } from 'typeorm';

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
}

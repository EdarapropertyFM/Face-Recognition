import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('incidents')
export class Incident {
  @PrimaryColumn()
  id: string;

  @Column()
  sef: string;

  @Column('simple-array')
  title: string[];

  @Column({ nullable: true })
  face: string;

  @Column()
  zone: number;

  @Column()
  when: string;

  @Column('simple-array')
  officer: string[];

  @Column()
  status: string; // open, review, closed

  @Column('simple-array', { nullable: true })
  desc: string[];

  @Column('jsonb', { default: [] })
  att: string[];

  @Column({ nullable: true, unique: true })
  alertId: string;
}

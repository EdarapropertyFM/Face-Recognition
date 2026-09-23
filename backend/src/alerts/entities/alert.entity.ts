import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('alerts')
export class Alert {
  @PrimaryColumn()
  id: string;

  @Column()
  face: string;

  @Column()
  cam: string;

  @Column()
  zone: number;

  @Column()
  when: string;

  @Column()
  conf: number;

  @Column()
  status: string; // new, ack, actioned, resolved, false

  @Column('jsonb', { default: [] })
  log: any[]; // Array of [user, action, timestamp]

  @Column({ nullable: true })
  incidentId: string;
}

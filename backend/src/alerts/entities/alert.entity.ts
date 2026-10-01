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

  /**
   * [actor, action, timestamp] entries. An alert no longer has a triage
   * lifecycle -- it is a notification that somebody was seen, not a case to
   * work -- so this now only records how the alert came to exist.
   */
  @Column('jsonb', { default: [] })
  log: any[];

  @Column({ nullable: true })
  incidentId: string;
}

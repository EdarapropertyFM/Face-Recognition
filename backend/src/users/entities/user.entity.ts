import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryColumn()
  u: string;

  @Column('simple-array')
  name: string[]; // [English, Arabic]

  @Column()
  role: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ nullable: true, select: false })
  passwordHash: string;

  // When this user last opened their alert notifications. The badge counts
  // only alerts raised after it, so clicking the bell clears the count for
  // this user without touching any alert's triage status -- one guard reading
  // the notifications must not mark the alerts handled for everybody else.
  @Column({ nullable: true })
  alertsSeenAt: string;
}

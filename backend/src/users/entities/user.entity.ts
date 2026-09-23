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
}

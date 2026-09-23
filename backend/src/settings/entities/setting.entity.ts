import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('settings')
export class Setting {
  @PrimaryColumn()
  id: string; // 'system'

  @Column()
  threshold: number;

  @Column()
  retStd: number;

  @Column()
  retInc: number;

  @Column()
  retLog: number;

  @Column()
  alertOwners: boolean;

  @Column()
  alertStrangers: boolean;

  @Column()
  alertWatch: boolean;
}

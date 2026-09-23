import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('buildings')
export class Building {
  @PrimaryColumn()
  code: string;

  @Column('simple-array')
  name: string[];

  @Column()
  units: number;

  @Column('jsonb', { default: [] })
  unitCodes: string[];

  @Column()
  cams: number;

  @Column()
  enrolled: number;

  @Column()
  strangersToday: number;
}

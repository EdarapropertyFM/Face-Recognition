import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('detections')
export class Detection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  face: string;

  @Column()
  zone: number;

  @Column()
  conf: number;

  @Column()
  type: string; // normal, watch, spoof

  @Column()
  cam: string;

  @Column()
  when: string;

  @Column({ nullable: true })
  decision: string;

  @Column({ nullable: true, type: 'float' })
  similarity: number;

  @Column('jsonb', { nullable: true })
  quality: unknown;
}

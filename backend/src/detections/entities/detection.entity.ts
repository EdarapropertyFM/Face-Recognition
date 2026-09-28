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

  /**
   * The face image this sighting was recognised from, relative to the AI's
   * snapshot directory. A row saying "a stranger was seen" is of little use
   * to an operator who cannot see who it was.
   */
  @Column({ type: 'varchar', nullable: true })
  snapshot: string | null;
}

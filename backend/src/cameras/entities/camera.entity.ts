import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('cameras')
export class Camera {
  @PrimaryColumn()
  id: string;

  @Column()
  zone: number;

  @Column()
  status: string; // online, offline

  @Column()
  det: number;

  @Column()
  last: string;

  @Column({ default: '' })
  displayName: string;

  @Column({ type: 'varchar', nullable: true })
  buildingCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  rtspUrlEncrypted: string | null;

  @Column({ default: false })
  rtspConfigured: boolean;

  @Column({ unique: true, default: () => 'gen_random_uuid()' })
  playbackId: string;

  @Column({ default: 'unknown' })
  codec: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: 'unconfigured' })
  streamStatus: string;

  @Column({ type: 'varchar', nullable: true })
  lastHeartbeat: string | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;
}
